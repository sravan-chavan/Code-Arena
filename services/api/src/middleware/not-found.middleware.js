const { sendError } = require('../utils/api-response');

/**
 * Handles unmatched routes. Must run after all route mounts.
 */
function notFoundMiddleware(req, res, _next) {
  return sendError(
    res,
    `Route not found: ${req.method} ${req.originalUrl}`,
    404,
  );
}

module.exports = notFoundMiddleware;
