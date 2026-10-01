const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { WebSocket } = require('ws');
const { attachGateway } = require('../src/realtime/gateway');
const dispatcher = require('../src/realtime/dispatcher');
const {
  createEvent,
  EVENT_TYPES,
  EVENT_VERSION,
  rankingPayload,
  submissionEventType,
  assertSafePayload,
} = require('../src/realtime/events');

const CONTEST_A = '11111111-1111-4111-8111-111111111111';
const CONTEST_B = '22222222-2222-4222-8222-222222222222';

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function openSocket(port) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    socket.on('open', () => resolve(socket));
    socket.on('error', reject);
  });
}

function track(socket) {
  const messages = [];
  const waiters = [];
  socket.on('message', (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else messages.push(parsed);
  });
  return {
    socket,
    queued: () => messages.length,
    next(timeoutMs = 2000) {
      if (messages.length > 0) {
        return Promise.resolve(messages.shift());
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out waiting for websocket message')), timeoutMs);
        waiters.push((message) => {
          clearTimeout(timer);
          resolve(message);
        });
      });
    },
  };
}

async function authenticate(tracked, token) {
  const pending = tracked.next();
  tracked.socket.send(JSON.stringify({ type: 'auth', token }));
  const message = await pending;
  assert.equal(message.type, EVENT_TYPES.SYSTEM_AUTHENTICATED);
  return message;
}

describe('realtime event envelope', () => {
  it('builds a versioned envelope and rejects unsafe or unknown events', () => {
    const event = createEvent({
      type: EVENT_TYPES.CONTEST_STARTED,
      contestId: CONTEST_A,
      payload: { status: 'running' },
    });
    assert.equal(event.version, EVENT_VERSION);
    assert.equal(event.type, 'contest.started');
    assert.match(event.eventId, /^[0-9a-f-]{36}$/i);
    assert.equal(Number.isNaN(Date.parse(event.occurredAt)), false);
    assert.throws(
      () => createEvent({ type: 'contest.unknown', payload: {} }),
      /Unknown realtime event type/,
    );
    assert.throws(
      () => createEvent({ type: EVENT_TYPES.CONTEST_STARTED, payload: {}, version: 2 }),
      /Unsupported realtime event version/,
    );
    assert.throws(
      () => assertSafePayload({ sourceCode: 'print(1)' }),
      (err) => err.code === 'UNSAFE_REALTIME_PAYLOAD',
    );
    assert.throws(
      () => assertSafePayload({ nested: { expectedOutput: '3' } }),
      (err) => err.code === 'UNSAFE_REALTIME_PAYLOAD',
    );
    assert.equal(submissionEventType('INTERNAL_ERROR'), EVENT_TYPES.SUBMISSION_FAILED);
    assert.equal(submissionEventType('ACCEPTED'), EVENT_TYPES.SUBMISSION_COMPLETED);
  });

  it('sends a ranking snapshot under the cap and invalidates above it', () => {
    const small = rankingPayload([{ participantId: 'p1', email: 'a@b.c', score: 1 }], 200);
    assert.equal(small.mode, 'snapshot');
    assert.equal(small.ranking[0].email, undefined);
    assert.equal(small.ranking[0].score, 1);
    const large = rankingPayload(Array.from({ length: 3 }, (_v, index) => ({ participantId: String(index) })), 2);
    assert.equal(large.mode, 'invalidate');
    assert.equal(large.participantCount, 3);
    assert.equal(large.ranking, undefined);
  });
});

describe('websocket gateway', { concurrency: 1 }, () => {
  /** @type {import('http').Server} */
  let server;
  /** @type {ReturnType<typeof attachGateway>} */
  let gateway;
  let port;

  const users = {
    studentA: { id: 'student-a', role: 'STUDENT' },
    studentB: { id: 'student-b', role: 'STUDENT' },
    admin: { id: 'admin-1', role: 'ADMIN' },
  };

  before(async () => {
    server = http.createServer();
    gateway = attachGateway(server, {
      config: {
        enabled: true,
        path: '/ws',
        maxConnections: 4,
        maxConnectionsPerUser: 4,
        maxSubscriptionsPerConnection: 2,
        authTimeoutMs: 400,
        heartbeatIntervalMs: 50,
        maxPayloadBytes: 65536,
        maxMalformedMessages: 2,
        rankingSnapshotMax: 200,
        contestWatchEnabled: false,
        contestWatchIntervalMs: 5000,
        contestEndingLeadSeconds: 60,
      },
      authenticate: async (token) => {
        if (!users[token]) {
          const error = new Error('nope');
          error.code = 'UNAUTHENTICATED';
          throw error;
        }
        return users[token];
      },
      authorize: async (user, contestId) => {
        if (contestId === CONTEST_B) return { ok: false, code: 'FORBIDDEN' };
        if (user.role === 'ADMIN') return { ok: true };
        if (user.id === 'student-a' || user.id === 'student-b') return { ok: true };
        return { ok: false, code: 'FORBIDDEN' };
      },
    });
    port = await listen(server);
  });

  after(async () => {
    gateway.close();
    dispatcher.clear();
    await new Promise((resolve) => server.close(resolve));
  });

  it('rejects a bad token and ignores unknown client messages without crashing', async () => {
    const socket = await openSocket(port);
    const tracked = track(socket);
    tracked.socket = socket;
    const pending = tracked.next();
    socket.send(JSON.stringify({ type: 'auth', token: 'nope' }));
    const error = await pending;
    assert.equal(error.type, EVENT_TYPES.SYSTEM_ERROR);
    assert.equal(error.payload.code, 'UNAUTHENTICATED');
    await new Promise((resolve) => socket.once('close', resolve));
  });

  it('authenticates, refuses an unauthorized contest, and isolates private submission events', async () => {
    const studentA = track(await openSocket(port));
    const studentB = track(await openSocket(port));
    const admin = track(await openSocket(port));
    await authenticate(studentA, 'studentA');
    await authenticate(studentB, 'studentB');
    await authenticate(admin, 'admin');

    const denied = studentA.next();
    studentA.socket.send(JSON.stringify({ type: 'subscribe', contestId: CONTEST_B }));
    const denial = await denied;
    assert.equal(denial.payload.code, 'FORBIDDEN');

    const subA = studentA.next();
    const subB = studentB.next();
    const subAdmin = admin.next();
    studentA.socket.send(JSON.stringify({ type: 'subscribe', contestId: CONTEST_A }));
    studentB.socket.send(JSON.stringify({ type: 'subscribe', contestId: CONTEST_A }));
    admin.socket.send(JSON.stringify({ type: 'subscribe', contestId: CONTEST_A }));
    assert.equal((await subA).type, EVENT_TYPES.SYSTEM_SUBSCRIBED);
    assert.equal((await subB).type, EVENT_TYPES.SYSTEM_SUBSCRIBED);
    assert.equal((await subAdmin).type, EVENT_TYPES.SYSTEM_SUBSCRIBED);

    const unknown = studentA.next();
    studentA.socket.send(JSON.stringify({ type: 'not-a-command' }));
    assert.equal((await unknown).payload.code, 'UNKNOWN_MESSAGE');

    const malformed = studentA.next();
    studentA.socket.send('not-json');
    assert.equal((await malformed).payload.code, 'MALFORMED');

    const ownerEvent = createEvent({
      type: EVENT_TYPES.SUBMISSION_COMPLETED,
      contestId: CONTEST_A,
      payload: {
        submissionId: '33333333-3333-4333-8333-333333333333',
        status: 'ACCEPTED',
        score: 10,
      },
    });
    const forA = studentA.next();
    dispatcher.publish({
      envelope: ownerEvent,
      delivery: { contestId: CONTEST_A, ownerUserId: 'student-a', scopes: ['owner'] },
    });
    const received = await forA;
    assert.equal(received.type, EVENT_TYPES.SUBMISSION_COMPLETED);
    assert.equal(received.payload.score, 10);
    assert.equal(received.payload.sourceCode, undefined);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(studentB.queued(), 0);

    const adminSummary = createEvent({
      type: EVENT_TYPES.SUBMISSION_COMPLETED,
      contestId: CONTEST_A,
      payload: { submissionId: ownerEvent.payload.submissionId, status: 'ACCEPTED', score: 10 },
    });
    const adminMessage = admin.next();
    dispatcher.publish({
      envelope: adminSummary,
      delivery: { contestId: CONTEST_A, scopes: ['admins'] },
    });
    assert.equal((await adminMessage).type, EVENT_TYPES.SUBMISSION_COMPLETED);
    await new Promise((resolve) => setTimeout(resolve, 120));

    const ranking = createEvent({
      type: EVENT_TYPES.CONTEST_RANKING_UPDATED,
      contestId: CONTEST_A,
      payload: { mode: 'snapshot', ranking: [{ participantId: 'p', rank: 1, score: 10 }] },
    });
    const rankA = studentA.next();
    const rankB = studentB.next();
    dispatcher.publish({
      envelope: ranking,
      delivery: { contestId: CONTEST_A, scopes: ['contest'] },
    });
    assert.equal((await rankA).type, EVENT_TYPES.CONTEST_RANKING_UPDATED);
    assert.equal((await rankB).payload.ranking[0].rank, 1);

    studentA.socket.close();
    studentB.socket.close();
    admin.socket.close();
  });

  it('cleans up a dead socket on heartbeat and enforces the connection limit', async () => {
    const tracked = track(await openSocket(port));
    await authenticate(tracked, 'studentA');
    tracked.socket._socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(gateway.stats().connections <= 1, true);

    const sockets = [];
    for (let index = 0; index < 5; index += 1) {
      try {
        sockets.push(await openSocket(port));
      } catch {
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.ok(gateway.stats().connections <= 4);
    for (const open of sockets) open.close();
  });
});
