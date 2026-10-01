/**
 * Routing-key and message-type registry.
 *
 * Convention:
 *   codearena.<domain>.<event>
 *
 * The message type and the routing key are the same string. Dead-letter
 * routing keys append `.dead`.
 *
 * M5 registered the architecture probe. M6 adds the execution request used
 * by the Worker. The results queue carries execution started and completed
 * so the API can persist outcomes and fan them out on WebSockets.
 * Contest notifications are in-process WebSocket events, not AMQP types.
 */

const MESSAGE_TYPES = Object.freeze({
  SYSTEM_TEST: 'codearena.system.test',
  EXECUTION_REQUESTED: 'codearena.execution.requested',
  EXECUTION_STARTED: 'codearena.execution.started',
  EXECUTION_COMPLETED: 'codearena.execution.completed',
});

const DEAD_LETTER_ROUTING_KEYS = Object.freeze({
  SYSTEM_TEST: 'codearena.system.test.dead',
  EXECUTION_REQUESTED: 'codearena.execution.requested.dead',
  EXECUTION_STARTED: 'codearena.execution.started.dead',
  EXECUTION_COMPLETED: 'codearena.execution.completed.dead',
});

const KNOWN_MESSAGE_TYPES = Object.freeze(new Set(Object.values(MESSAGE_TYPES)));

function isKnownMessageType(type) {
  return KNOWN_MESSAGE_TYPES.has(type);
}

module.exports = {
  MESSAGE_TYPES,
  DEAD_LETTER_ROUTING_KEYS,
  isKnownMessageType,
};
