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
 * by the Worker. Do not add contest/notification keys until those milestones.
 */

const MESSAGE_TYPES = Object.freeze({
  SYSTEM_TEST: 'codearena.system.test',
  EXECUTION_REQUESTED: 'codearena.execution.requested',
});

const DEAD_LETTER_ROUTING_KEYS = Object.freeze({
  SYSTEM_TEST: 'codearena.system.test.dead',
  EXECUTION_REQUESTED: 'codearena.execution.requested.dead',
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
