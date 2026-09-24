const { randomUUID } = require('crypto');
const { isKnownMessageType } = require('./routing');
const { MessageContractError } = require('./errors');

/** Envelope schema version. M6+ may introduce version 2 without reusing this shape. */
const CONTRACT_VERSION = 1;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} value
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * @param {unknown} message
 */
function validateMessage(message) {
  if (!isPlainObject(message)) {
    throw new MessageContractError('Message must be a plain object');
  }
  if (typeof message.messageId !== 'string' || !UUID_PATTERN.test(message.messageId)) {
    throw new MessageContractError('messageId must be a UUID');
  }
  if (!isKnownMessageType(message.type)) {
    throw new MessageContractError(
      'type must be a registered codearena.<domain>.<event> message type',
    );
  }
  if (message.version !== CONTRACT_VERSION) {
    throw new MessageContractError(`Unsupported message version: ${String(message.version)}`);
  }
  if (typeof message.occurredAt !== 'string' || Number.isNaN(Date.parse(message.occurredAt))) {
    throw new MessageContractError('occurredAt must be an ISO-8601 timestamp');
  }
  if (!isPlainObject(message.payload)) {
    throw new MessageContractError('payload must be a plain object');
  }
}

/**
 * Builds a versioned envelope. Business fields belong inside payload, never
 * beside messageId/type/version/occurredAt.
 *
 * @param {{ type: string, payload?: Record<string, unknown>, messageId?: string, occurredAt?: string, version?: number }} input
 */
function createMessage(input) {
  if (!isPlainObject(input)) {
    throw new MessageContractError('Message input must be a plain object');
  }
  if (input.payload !== undefined && !isPlainObject(input.payload)) {
    throw new MessageContractError('payload must be a plain object');
  }

  const message = {
    messageId: input.messageId || randomUUID(),
    type: input.type,
    version: input.version === undefined ? CONTRACT_VERSION : input.version,
    occurredAt: input.occurredAt || new Date().toISOString(),
    payload: Object.freeze({ ...(input.payload || {}) }),
  };
  validateMessage(message);
  return Object.freeze(message);
}

/**
 * @param {ReturnType<typeof createMessage>} message
 * @returns {Buffer}
 */
function serializeMessage(message) {
  validateMessage(message);
  return Buffer.from(JSON.stringify(message), 'utf8');
}

/**
 * @param {Buffer | string} content
 */
function parseMessage(content) {
  const text = Buffer.isBuffer(content) ? content.toString('utf8') : String(content);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MessageContractError('Message body is not valid JSON');
  }
  validateMessage(parsed);
  return Object.freeze({
    messageId: parsed.messageId,
    type: parsed.type,
    version: parsed.version,
    occurredAt: parsed.occurredAt,
    payload: Object.freeze({ ...parsed.payload }),
  });
}

module.exports = {
  CONTRACT_VERSION,
  createMessage,
  validateMessage,
  serializeMessage,
  parseMessage,
};
