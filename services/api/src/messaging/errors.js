class MessagingError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, cause?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'MessagingError';
    this.code = options.code || 'MESSAGING_ERROR';
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

class MessageContractError extends MessagingError {
  /**
   * @param {string} message
   */
  constructor(message) {
    super(message, { code: 'MESSAGE_CONTRACT_INVALID' });
    this.name = 'MessageContractError';
  }
}

/**
 * Logs a messaging failure without the AMQP URL or password.
 *
 * @param {string} context
 * @param {unknown} err
 */
function logMessagingError(context, err) {
  const code = err && typeof err === 'object' && 'code' in err && err.code ? err.code : 'UNKNOWN';
  const message = err && typeof err === 'object' && 'message' in err && err.message
    ? err.message
    : 'unknown error';
  console.error(`[API] ${context}: code=${code} message=${message}`);
}

module.exports = {
  MessagingError,
  MessageContractError,
  logMessagingError,
};
