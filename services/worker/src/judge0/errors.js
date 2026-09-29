/**
 * Judge0 client / polling errors.
 *
 * These are processor failures: the shared consumer rejects the AMQP message
 * to the execution DLQ (M6 semantics). Terminal Judge0 verdicts are not errors.
 */

class Judge0Error extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, cause?: unknown, httpStatus?: number }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'Judge0Error';
    this.code = options.code || 'JUDGE0_ERROR';
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
    if (options.httpStatus !== undefined) {
      this.httpStatus = options.httpStatus;
    }
  }
}

module.exports = {
  Judge0Error,
};
