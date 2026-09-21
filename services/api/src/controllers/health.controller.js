const healthService = require('../services/health.service');
const { sendSuccess } = require('../utils/api-response');

function getHealth(_req, res) {
  const data = healthService.getHealth();
  return sendSuccess(res, data, 200, 'API is healthy');
}

module.exports = {
  getHealth,
};
