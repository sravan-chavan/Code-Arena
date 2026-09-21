const healthService = require('../services/health.service');
const AppError = require('../errors/AppError');
const { sendSuccess } = require('../utils/api-response');

function getHealth(_req, res) {
  const data = healthService.getHealth();
  return sendSuccess(res, data, 200, 'API is healthy');
}

async function getDatabaseHealth(_req, res) {
  const result = await healthService.getDatabaseHealth();
  if (!result.ok) {
    throw new AppError('Database is unavailable', 503, {
      code: 'DB_UNAVAILABLE',
    });
  }

  return sendSuccess(
    res,
    {
      database: 'up',
      latencyMs: result.latencyMs,
    },
    200,
    'Database is reachable',
  );
}

module.exports = {
  getHealth,
  getDatabaseHealth,
};
