/**
 * Single-instance WebSocket gateway.
 *
 * Identity comes from the existing JWT. Contest membership is checked on the
 * server. Clients cannot claim a user id, role, or participant id.
 *
 * No Redis. Events published on this process reach sockets connected here.
 * A second API instance would need a shared bus before it could fan out.
 */

const { WebSocketServer, WebSocket } = require('ws');
const { verifyToken } = require('../auth/jwt');
const userRepository = require('../repositories/user.repository');
const contestRepository = require('../repositories/contest.repository');
const participantRepository = require('../repositories/participant.repository');
const { ROLES } = require('../auth/roles');
const { assertUuid } = require('../utils/input');
const dispatcher = require('./dispatcher');
const { loadRealtimeConfig } = require('./config');
const { EVENT_TYPES, EVENT_VERSION, createEvent, isPlainObject, UUID_PATTERN } = require('./events');

function defaultAuthenticate(token) {
  const claims = verifyToken(token);
  return userRepository.findById(claims.sub).then((user) => {
    if (!user) {
      const error = new Error('Authentication required');
      error.code = 'UNAUTHENTICATED';
      throw error;
    }
    return { id: user.id, role: user.role };
  });
}

async function defaultAuthorize(user, contestId) {
  let id;
  try {
    id = assertUuid(contestId, 'contestId');
  } catch {
    return { ok: false, code: 'VALIDATION_ERROR' };
  }
  const contest = await contestRepository.findById(id);
  if (!contest || contest.status === 'draft') {
    return { ok: false, code: 'NOT_FOUND' };
  }
  if (user.role === ROLES.ADMIN) {
    return { ok: true };
  }
  if (user.role !== ROLES.STUDENT) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  const participant = await participantRepository.findByContestAndUser(id, user.id);
  if (!participant) {
    return { ok: false, code: 'FORBIDDEN' };
  }
  if (participant.status === 'removed') {
    return { ok: false, code: 'PARTICIPANT_REMOVED' };
  }
  return { ok: true, participantId: participant.id };
}

function sendEnvelope(ws, envelope) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(envelope));
}

function systemError(code, message) {
  return createEvent({
    type: EVENT_TYPES.SYSTEM_ERROR,
    payload: { code, message },
  });
}

function attachGateway(server, options = {}) {
  const config = options.config || loadRealtimeConfig();
  const authenticate = options.authenticate || defaultAuthenticate;
  const authorize = options.authorize || defaultAuthorize;
  const connections = new Set();
  const byUser = new Map();

  if (!config.enabled) {
    return {
      close() {},
      stats() {
        return { connections: 0, subscriptions: 0, enabled: false };
      },
    };
  }

  const wss = new WebSocketServer({
    server,
    path: config.path,
    maxPayload: config.maxPayloadBytes,
  });

  function trackUser(conn) {
    const list = byUser.get(conn.user.id) || new Set();
    list.add(conn);
    byUser.set(conn.user.id, list);
  }

  function untrackUser(conn) {
    if (!conn.user) {
      return;
    }
    const list = byUser.get(conn.user.id);
    if (!list) {
      return;
    }
    list.delete(conn);
    if (list.size === 0) {
      byUser.delete(conn.user.id);
    }
  }

  function destroy(conn, code, reason) {
    if (conn.closed) {
      return;
    }
    conn.closed = true;
    clearTimeout(conn.authTimer);
    connections.delete(conn);
    untrackUser(conn);
    if (conn.ws.readyState === WebSocket.OPEN || conn.ws.readyState === WebSocket.CONNECTING) {
      conn.ws.close(code, reason);
    }
  }

  function deliver(conn, envelope) {
    sendEnvelope(conn.ws, envelope);
  }

  function route(item) {
    if (!item || !item.envelope || !item.delivery) {
      return;
    }
    const { envelope, delivery } = item;
    const scopes = new Set(delivery.scopes || []);
    const contestId = delivery.contestId || null;
    const targets = new Set();

    if (scopes.has('contest') && contestId) {
      for (const conn of connections) {
        if (conn.user && conn.subscriptions.has(contestId)) {
          targets.add(conn);
        }
      }
    }
    if (scopes.has('admins') && contestId) {
      for (const conn of connections) {
        if (conn.user && conn.user.role === ROLES.ADMIN && conn.subscriptions.has(contestId)) {
          targets.add(conn);
        }
      }
    }
    if (scopes.has('owner') && delivery.ownerUserId) {
      const list = byUser.get(delivery.ownerUserId);
      if (list) {
        for (const conn of list) {
          targets.add(conn);
        }
      }
    }
    for (const conn of targets) {
      deliver(conn, envelope);
    }
  }

  const unsubscribe = dispatcher.subscribe(route);

  function heartbeat() {
    for (const conn of connections) {
      if (conn.closed) {
        continue;
      }
      if (!conn.isAlive) {
        destroy(conn, 4000, 'heartbeat timeout');
        continue;
      }
      conn.isAlive = false;
      try {
        conn.ws.ping();
      } catch {
        destroy(conn, 4000, 'heartbeat failed');
      }
    }
  }

  const heartbeatTimer = setInterval(heartbeat, config.heartbeatIntervalMs);
  if (typeof heartbeatTimer.unref === 'function') {
    heartbeatTimer.unref();
  }

  async function subscribeContest(conn, contestId) {
    if (!conn.user) {
      sendEnvelope(conn.ws, systemError('UNAUTHENTICATED', 'Authenticate before subscribing.'));
      return;
    }
    if (typeof contestId !== 'string' || !UUID_PATTERN.test(contestId)) {
      sendEnvelope(conn.ws, systemError('VALIDATION_ERROR', 'contestId must be a UUID.'));
      return;
    }
    if (conn.subscriptions.has(contestId)) {
      sendEnvelope(conn.ws, createEvent({
        type: EVENT_TYPES.SYSTEM_SUBSCRIBED,
        contestId,
        payload: { contestId },
      }));
      return;
    }
    if (conn.subscriptions.size >= config.maxSubscriptionsPerConnection) {
      sendEnvelope(conn.ws, systemError('SUBSCRIPTION_LIMIT', 'Subscription limit reached.'));
      return;
    }
    const decision = await authorize(conn.user, contestId);
    if (!decision || !decision.ok) {
      sendEnvelope(conn.ws, systemError(decision?.code || 'FORBIDDEN', 'Contest subscription denied.'));
      return;
    }
    conn.subscriptions.add(contestId);
    sendEnvelope(conn.ws, createEvent({
      type: EVENT_TYPES.SYSTEM_SUBSCRIBED,
      contestId,
      payload: { contestId },
    }));
  }

  async function onMessage(conn, raw) {
    let text;
    try {
      text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
    } catch {
      text = '';
    }
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      conn.malformed += 1;
      sendEnvelope(conn.ws, systemError('MALFORMED', 'Message is not valid JSON.'));
      if (conn.malformed >= config.maxMalformedMessages) {
        destroy(conn, 4002, 'malformed');
      }
      return;
    }
    if (!isPlainObject(message) || typeof message.type !== 'string') {
      conn.malformed += 1;
      sendEnvelope(conn.ws, systemError('MALFORMED', 'Message type is required.'));
      return;
    }

    if (message.type === 'auth') {
      if (conn.user) {
        sendEnvelope(conn.ws, systemError('ALREADY_AUTHENTICATED', 'Connection is already authenticated.'));
        return;
      }
      try {
        const user = await authenticate(message.token);
        const existing = byUser.get(user.id);
        if (existing && existing.size >= config.maxConnectionsPerUser) {
          sendEnvelope(conn.ws, systemError('CONNECTION_LIMIT', 'Connection limit reached for this user.'));
          destroy(conn, 4008, 'connection limit');
          return;
        }
        conn.user = { id: user.id, role: user.role };
        clearTimeout(conn.authTimer);
        trackUser(conn);
        sendEnvelope(conn.ws, createEvent({
          type: EVENT_TYPES.SYSTEM_AUTHENTICATED,
          payload: { userId: user.id, role: user.role },
        }));
      } catch {
        sendEnvelope(conn.ws, systemError('UNAUTHENTICATED', 'Authentication failed.'));
        destroy(conn, 4001, 'authentication failed');
      }
      return;
    }

    if (message.type === 'subscribe') {
      await subscribeContest(conn, message.contestId);
      return;
    }

    if (message.type === 'unsubscribe') {
      if (typeof message.contestId === 'string') {
        conn.subscriptions.delete(message.contestId);
        sendEnvelope(conn.ws, createEvent({
          type: EVENT_TYPES.SYSTEM_UNSUBSCRIBED,
          contestId: UUID_PATTERN.test(message.contestId) ? message.contestId : null,
          payload: { contestId: message.contestId },
        }));
      }
      return;
    }

    if (message.type === 'pong') {
      conn.isAlive = true;
      return;
    }

    sendEnvelope(conn.ws, systemError('UNKNOWN_MESSAGE', 'Unknown client message.'));
  }

  wss.on('connection', (ws) => {
    if (connections.size >= config.maxConnections) {
      try {
        ws.close(4008, 'server connection limit');
      } catch {
        ws.terminate();
      }
      return;
    }
    const conn = {
      ws,
      user: null,
      subscriptions: new Set(),
      isAlive: true,
      malformed: 0,
      closed: false,
      authTimer: setTimeout(() => {
        if (!conn.user) {
          destroy(conn, 4001, 'authentication timeout');
        }
      }, config.authTimeoutMs),
    };
    connections.add(conn);
    ws.on('pong', () => {
      conn.isAlive = true;
    });
    ws.on('message', (raw) => {
      void onMessage(conn, raw).catch((err) => {
        console.error(`[API] WebSocket message failed: ${err.message}`);
        sendEnvelope(ws, systemError('INTERNAL', 'Unable to process message.'));
      });
    });
    ws.on('close', () => {
      destroy(conn, 1000, 'closed');
    });
    ws.on('error', () => {
      destroy(conn, 1011, 'error');
    });
  });

  let closed = false;
  function close() {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(heartbeatTimer);
    unsubscribe();
    for (const conn of connections) {
      destroy(conn, 1001, 'server shutdown');
    }
    wss.close();
  }

  function stats() {
    let subscriptions = 0;
    for (const conn of connections) {
      subscriptions += conn.subscriptions.size;
    }
    return {
      connections: connections.size,
      subscriptions,
      enabled: true,
      version: EVENT_VERSION,
    };
  }

  console.log(
    `[API] WebSocket gateway listening path=${config.path} maxConnections=${config.maxConnections}`,
  );

  return {
    close,
    stats,
    route,
  };
}

module.exports = {
  attachGateway,
  defaultAuthenticate,
  defaultAuthorize,
};
