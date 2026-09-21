/**
 * Operational application error with HTTP status and optional field errors.
 */
class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} [statusCode=500]
   * @param {{ errors?: unknown[], code?: string, isOperational?: boolean }} [options]
   */
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = options.errors || [];
    this.code = options.code;
    this.isOperational =
      options.isOperational !== undefined ? options.isOperational : true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

module.exports = AppError;
