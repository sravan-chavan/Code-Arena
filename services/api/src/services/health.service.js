const config = require('../config/environment');
const { checkDatabase } = require('../db/health');

/**
 * Process-level liveness (no PostgreSQL). Used by Docker /health.
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

/**
 * Readiness probe: actually executes SELECT 1 against PostgreSQL.
 */
async function getDatabaseHealth() {
  return checkDatabase();
}

module.exports = {
  getHealth,
  getDatabaseHealth,
};
