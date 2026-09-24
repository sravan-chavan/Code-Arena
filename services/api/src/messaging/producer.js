const { loadRabbitmqConfig } = require('../config/rabbitmq');
const { createMessage, serializeMessage } = require('./contract');
const { getPublishChannel, isConnected } = require('./connection');
const { MessagingError } = require('./errors');

/**
 * Publishes one validated envelope to the application exchange.
 * Callers pass `{ type, payload }`. They do not choose the queue, channel,
 * or AMQP options.
 *
 * Confirmed publish: the promise resolves only after the broker confirms
 * the message. `mandatory` plus the channel `return` handler rejects the
 * promise when the routing key matches no queue.
 *
 * @param {{ type: string, payload?: Record<string, unknown> }} input
 */
async function publish(input) {
  const message = createMessage({
    type: input && input.type,
    payload: input && input.payload,
  });

  if (!isConnected()) {
    throw new MessagingError('RabbitMQ is not connected', {
      code: 'RABBITMQ_NOT_CONNECTED',
    });
  }

  const config = loadRabbitmqConfig();
  const channel = getPublishChannel();
  const body = serializeMessage(message);
  const options = {
    persistent: true,
    mandatory: true,
    contentType: 'application/json',
    contentEncoding: 'utf-8',
    messageId: message.messageId,
    timestamp: Math.floor(Date.parse(message.occurredAt) / 1000),
    type: message.type,
    appId: 'codearena-api',
    headers: {
      'x-codearena-contract-version': message.version,
    },
  };

  await new Promise((resolve, reject) => {
    let returned = false;
    let settled = false;

    const finish = (err) => {
      if (settled) {
        return;
      }
      settled = true;
      channel.removeListener('return', onReturn);
      channel.removeListener('close', onClose);
      if (err) {
        reject(err);
        return;
      }
      resolve();
    };

    const onReturn = (returnedMessage) => {
      if (
        returnedMessage
        && returnedMessage.properties
        && returnedMessage.properties.messageId === message.messageId
      ) {
        returned = true;
      }
    };

    const onClose = () => {
      finish(
        new MessagingError('RabbitMQ publish channel closed before confirm', {
          code: 'RABBITMQ_CHANNEL_CLOSED',
        }),
      );
    };

    channel.on('return', onReturn);
    channel.on('close', onClose);

    try {
      channel.publish(config.exchange, message.type, body, options, (err) => {
        if (err) {
          finish(err);
          return;
        }
        if (returned) {
          finish(
            new MessagingError(`Message ${message.messageId} was not routed to any queue`, {
              code: 'MESSAGE_UNROUTABLE',
            }),
          );
          return;
        }
        finish();
      });
    } catch (err) {
      finish(err);
    }
  });

  return message;
}

module.exports = {
  publish,
};
