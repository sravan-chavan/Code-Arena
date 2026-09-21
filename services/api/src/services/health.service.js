const config = require('../config/environment');

/**
 * Process-level health details only (no DB / RabbitMQ in Milestone 1).
 */
function getHealth() {
  return {
    status: 'ok',
    service: config.serviceName,
    milestone: config.milestone,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getHealth,
};
