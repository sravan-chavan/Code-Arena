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
 * by the Worker. Execution completion is a result event consumed by the API
 * so the browser can poll persisted Judge0 outcomes. Do not add contest
 * notification keys until those milestones.
 */

const MESSAGE_TYPES = Object.freeze({
  SYSTEM_TEST: 'codearena.system.test',
  EXECUTION_REQUESTED: 'codearena.execution.requested',
  EXECUTION_COMPLETED: 'codearena.execution.completed',
});

const DEAD_LETTER_ROUTING_KEYS = Object.freeze({
  SYSTEM_TEST: 'codearena.system.test.dead',
  EXECUTION_REQUESTED: 'codearena.execution.requested.dead',
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
