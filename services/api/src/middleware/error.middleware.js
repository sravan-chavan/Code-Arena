const config = require('../config/environment');
const AppError = require('../errors/AppError');
const { sendError } = require('../utils/api-response');

/**
 * Centralized error handler. Must be registered last.
 */
function errorMiddleware(err, req, res, _next) {
  let statusCode = 500;
  let message = 'Internal server error';
  let errors = [];

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors || [];
  } else if (err?.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON payload';
  } else if (err?.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request payload too large';
  } else if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    message = 'Invalid JSON payload';
  }

  if (!config.isProduction && !(err instanceof AppError)) {
    console.error('[API] Unexpected error:', err);
  } else if (err instanceof AppError && !err.isOperational) {
    console.error('[API] Non-operational error:', err);
  }

  if (req.requestId) {
    res.setHeader('X-Request-Id', req.requestId);
  }

  return sendError(res, message, statusCode, errors);
}

module.exports = errorMiddleware;
