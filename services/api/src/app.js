const express = require('express');
const config = require('./config/environment');
const routes = require('./routes');
const requestIdMiddleware = require('./middleware/request-id.middleware');
const requestLoggerMiddleware = require('./middleware/request-logger.middleware');
const securityMiddleware = require('./middleware/security.middleware');
const notFoundMiddleware = require('./middleware/not-found.middleware');
const errorMiddleware = require('./middleware/error.middleware');
const { sendSuccess } = require('./utils/api-response');
const asyncHandler = require('./utils/async-handler');

/**
 * Builds the Express application (no listen). Used by server.js and tests.
 */
function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Middleware order:
  // 1. Request ID
  app.use(requestIdMiddleware);
  // 2. Request logging (before body parsers so parse failures are still logged on finish)
  app.use(requestLoggerMiddleware);
  // 3. Security headers
  app.use(securityMiddleware);
  // 4. Body parsers (size-limited)
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

  app.get(
    '/',
    asyncHandler((_req, res) =>
      sendSuccess(
        res,
        {
          service: config.serviceName,
          milestone: config.milestone,
          health: '/health',
          versionedHealth: '/v1/health',
          databaseHealth: '/v1/health/db',
        },
        200,
          'CodeArena API (Milestone 8)',
      ),
    ),
  );

  app.use(routes);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}

module.exports = {
  createApp,
};
