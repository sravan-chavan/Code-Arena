const { loadRabbitmqConfig } = require('./config');
const { parseMessage } = require('./contract');
const { getConnection, isConnected } = require('./connection');
const { MessageContractError, MessagingError, logMessagingError } = require('./errors');
const { messagingLogPrefix } = require('./identity');

/** @type {import('amqplib').Channel | null} */
let consumeChannel = null;
/** @type {Map<string, string>} */
const subscriptions = new Map();
/** Number of deliveries currently inside handleDelivery. */
let inFlightCount = 0;

/**
 * Manual acknowledgement decisions.
 *
 * - handler success → ACK. The broker drops the message.
 * - handler throw → reject, requeue false. The queue DLX routes it to the DLQ.
 * - malformed body or contract → reject, requeue false. Same DLQ path.
 *
 * requeue is never true. Requeue would spin the same message immediately.
 * Delayed retry and DLQ replay are deferred.
 *
 * @param {unknown} error
 * @returns {{ action: 'ack' } | { action: 'reject', requeue: false, reason: 'handler' | 'malformed' }}
 */
function decideAcknowledgement(error) {
  if (!error) {
    return { action: 'ack' };
  }
  if (error instanceof MessageContractError || (error && error.code === 'MESSAGE_CONTRACT_INVALID')) {
    return { action: 'reject', requeue: false, reason: 'malformed' };
  }
  return { action: 'reject', requeue: false, reason: 'handler' };
}

function safeReject(channel, msg) {
  try {
    channel.reject(msg, false);
  } catch (err) {
    logMessagingError('Failed to reject RabbitMQ message', err);
  }
}

/**
 * @param {import('amqplib').Channel} channel
 * @param {import('amqplib').ConsumeMessage | null} msg
 * @param {(message: ReturnType<typeof parseMessage>) => Promise<void> | void} handler
 */
async function handleDelivery(channel, msg, handler) {
  if (!msg) {
    return;
  }

  inFlightCount += 1;
  try {
    let message;
    try {
      message = parseMessage(msg.content);
    } catch (err) {
      logMessagingError('Malformed RabbitMQ message rejected to DLQ', err);
      applyAcknowledgement(channel, msg, decideAcknowledgement(err));
      return;
    }

    console.log(
      `${messagingLogPrefix()} Job received messageId=${message.messageId} type=${message.type}`,
    );

    try {
      await handler(message);
    } catch (err) {
      logMessagingError(
        `Handler failed for messageId=${message.messageId} type=${message.type}; rejecting to DLQ`,
        err,
      );
      applyAcknowledgement(channel, msg, decideAcknowledgement(err), message);
      return;
    }

    applyAcknowledgement(channel, msg, decideAcknowledgement(null), message);
  } finally {
    inFlightCount = Math.max(0, inFlightCount - 1);
  }
}

/**
 * @param {import('amqplib').Channel} channel
 * @param {import('amqplib').ConsumeMessage} msg
 * @param {ReturnType<typeof decideAcknowledgement>} decision
 * @param {{ messageId?: string, type?: string }} [message]
 */
function applyAcknowledgement(channel, msg, decision, message) {
  if (decision.action === 'ack') {
    try {
      channel.ack(msg);
      console.log(
        `${messagingLogPrefix()} Message ACKed messageId=${message && message.messageId} type=${message && message.type}`,
      );
    } catch (err) {
      logMessagingError(`Failed to ack messageId=${message && message.messageId}`, err);
    }
    return;
  }

  safeReject(channel, msg);
  console.log(
    `${messagingLogPrefix()} Message rejected/DLQ messageId=${message && message.messageId} type=${message && message.type} reason=${decision.reason}`,
  );
}

async function getConsumeChannel() {
  if (consumeChannel) {
    return consumeChannel;
  }
  if (!isConnected()) {
    throw new MessagingError('RabbitMQ is not connected', {
      code: 'RABBITMQ_NOT_CONNECTED',
    });
  }

  const config = loadRabbitmqConfig();
  const channel = await getConnection().createChannel();
  channel.on('error', (err) => {
    logMessagingError('RabbitMQ consume channel error', err);
  });
  channel.on('close', () => {
    if (consumeChannel === channel) {
      consumeChannel = null;
      subscriptions.clear();
    }
  });
  await channel.prefetch(config.prefetch);
  consumeChannel = channel;
  return channel;
}

/**
 * Registers a business handler. This module owns parse, validate, ack, and reject.
 * The handler owns domain work and must not ack or reject the AMQP message.
 *
 * @param {string} queueName
 * @param {(message: ReturnType<typeof parseMessage>) => Promise<void> | void} handler
 */
async function consume(queueName, handler) {
  if (typeof handler !== 'function') {
    throw new MessagingError('Consumer handler must be a function', {
      code: 'CONSUMER_HANDLER_INVALID',
    });
  }

  const channel = await getConsumeChannel();
  const result = await channel.consume(
    queueName,
    (msg) => {
      handleDelivery(channel, msg, handler).catch((err) => {
        logMessagingError('Unhandled consumer failure', err);
        if (msg) {
          safeReject(channel, msg);
        }
      });
    },
    { noAck: false },
  );

  subscriptions.set(result.consumerTag, queueName);
  console.log(
    `${messagingLogPrefix()} Consumer registered queue=${queueName} consumerTag=${result.consumerTag}`,
  );
  return {
    consumerTag: result.consumerTag,
    queueName,
  };
}

/**
 * @param {string} consumerTag
 */
async function cancelConsumer(consumerTag) {
  const channel = consumeChannel;
  subscriptions.delete(consumerTag);
  if (!channel) {
    return;
  }
  try {
    await channel.cancel(consumerTag);
  } catch (err) {
    logMessagingError(`Failed to cancel RabbitMQ consumer ${consumerTag}`, err);
  }
}

function getInFlightCount() {
  return inFlightCount;
}

/**
 * Waits until in-flight deliveries finish or the timeout elapses.
 *
 * @param {number} timeoutMs
 */
async function waitForInFlight(timeoutMs = 5_000) {
  const started = Date.now();
  while (inFlightCount > 0 && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => {
      setTimeout(resolve, 25);
    });
  }
  return inFlightCount === 0;
}

async function stopConsumers() {
  const tags = [...subscriptions.keys()];
  for (const tag of tags) {
    await cancelConsumer(tag);
  }
  subscriptions.clear();

  const channel = consumeChannel;
  consumeChannel = null;
  if (!channel) {
    return;
  }
  try {
    await channel.close();
  } catch (err) {
    logMessagingError('Error closing RabbitMQ consume channel', err);
  }
}

module.exports = {
  consume,
  cancelConsumer,
  stopConsumers,
  decideAcknowledgement,
  handleDelivery,
  getInFlightCount,
  waitForInFlight,
};
