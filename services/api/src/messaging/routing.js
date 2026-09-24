/**
 * Routing-key and message-type registry.
 *
 * Convention (choose this and keep it):
 *   codearena.<domain>.<event>
 *
 * The message type and the routing key are the same string. A topic exchange
 * can later bind wildcards such as `codearena.execution.*` without renaming
 * this registry. Dead-letter routing keys append `.dead`.
 *
 * M5 registers only the architecture probe. Do not add execution, contest,
 * or notification keys here until those milestones exist.
 */

const MESSAGE_TYPES = Object.freeze({
  SYSTEM_TEST: 'codearena.system.test',
});

const DEAD_LETTER_ROUTING_KEYS = Object.freeze({
  SYSTEM_TEST: 'codearena.system.test.dead',
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
