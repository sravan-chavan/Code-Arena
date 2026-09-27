const amqp = require('amqplib');
const {
  loadRabbitmqConfig,
  validateRabbitmqConfig,
  describeRabbitmqEndpoint,
} = require('./config');
const { MessagingError, logMessagingError } = require('./errors');
const { messagingLogPrefix } = require('./identity');

/** @type {import('amqplib').ChannelModel | null} */
let connection = null;
/** @type {import('amqplib').ConfirmChannel | null} */
let publishChannel = null;
let closing = false;
/** @type {((err?: Error) => void) | null} */
let unexpectedCloseHandler = null;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Startup connection attempts only. Runtime reconnect is owned by the caller
 * (Worker lifecycle) via setUnexpectedCloseHandler + re-init.
 *
 * @param {string} url
 * @param {{ attempts: number, delayMs: number, timeoutMs: number }} options
 */
async function connectWithRetry(url, options) {
  let lastError;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await amqp.connect(url, { timeout: options.timeoutMs });
    } catch (err) {
      lastError = err;
      logMessagingError(`Waiting for RabbitMQ (${attempt}/${options.attempts})`, err);
      if (attempt < options.attempts) {
        await sleep(options.delayMs);
      }
    }
  }

  throw new MessagingError('RabbitMQ is not reachable', {
    code: 'RABBITMQ_UNAVAILABLE',
    cause: lastError,
  });
}

function isConnected() {
  return connection !== null && publishChannel !== null;
}

function getPublishChannel() {
  if (!publishChannel) {
    throw new MessagingError('RabbitMQ is not connected', {
      code: 'RABBITMQ_NOT_CONNECTED',
    });
  }
  return publishChannel;
}

function getConnection() {
  if (!connection) {
    throw new MessagingError('RabbitMQ is not connected', {
      code: 'RABBITMQ_NOT_CONNECTED',
    });
  }
  return connection;
}

/**
 * Registers a callback invoked when the AMQP connection closes unexpectedly.
 * Used by the Worker reconnect loop. Pass null to clear.
 *
 * @param {((err?: Error) => void) | null} handler
 */
function setUnexpectedCloseHandler(handler) {
  unexpectedCloseHandler = typeof handler === 'function' ? handler : null;
}

/**
 * Opens one AMQP connection and one confirm channel for topology + publish.
 * A second channel for consumers is created by the consumer module.
 */
async function initConnection() {
  if (isConnected()) {
    return connection;
  }

  const config = loadRabbitmqConfig();
  validateRabbitmqConfig(config);

  const conn = await connectWithRetry(config.url, {
    attempts: config.connectAttempts,
    delayMs: config.connectDelayMs,
    timeoutMs: config.connectionTimeoutMs,
  });

  conn.on('error', (err) => {
    logMessagingError('RabbitMQ connection error', err);
  });
  conn.on('close', () => {
    const wasUnexpected = !closing;
    if (wasUnexpected) {
      console.error(`${messagingLogPrefix()} RabbitMQ connection closed unexpectedly`);
    }
    if (connection === conn) {
      connection = null;
      publishChannel = null;
    }
    if (wasUnexpected && unexpectedCloseHandler) {
      try {
        unexpectedCloseHandler();
      } catch (err) {
        logMessagingError('Unexpected-close handler failed', err);
      }
    }
  });

  const channel = await conn.createConfirmChannel();
  channel.on('error', (err) => {
    logMessagingError('RabbitMQ publish channel error', err);
  });
  channel.on('close', () => {
    if (publishChannel === channel) {
      publishChannel = null;
    }
  });

  connection = conn;
  publishChannel = channel;
  console.log(`${messagingLogPrefix()} RabbitMQ connected ${describeRabbitmqEndpoint(config)}`);
  return connection;
}

/**
 * Closes the publish channel and connection. Safe when already disconnected.
 */
async function closeConnection() {
  if (!connection && !publishChannel) {
    closing = false;
    return;
  }

  closing = true;
  const currentChannel = publishChannel;
  const currentConnection = connection;
  publishChannel = null;
  connection = null;

  try {
    if (currentChannel) {
      await currentChannel.close();
    }
  } catch (err) {
    logMessagingError('Error closing RabbitMQ publish channel', err);
  }

  try {
    if (currentConnection) {
      await currentConnection.close();
    }
  } catch (err) {
    logMessagingError('Error closing RabbitMQ connection', err);
  } finally {
    closing = false;
  }
}

module.exports = {
  initConnection,
  closeConnection,
  connectWithRetry,
  isConnected,
  getPublishChannel,
  getConnection,
  setUnexpectedCloseHandler,
};
