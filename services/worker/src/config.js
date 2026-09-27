/**
 * Worker configuration from environment variables.
 * Secrets are never hardcoded.
 */

const {
  loadRabbitmqConfig,
  validateRabbitmqConfig,
} = require('@codearena/messaging');

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function loadWorkerConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const rabbit = loadRabbitmqConfig(env);

  return Object.freeze({
    env: nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: parsePositiveInt(env.PORT, 4001),
    host: env.HOST || '0.0.0.0',
    serviceName: (env.CODEARENA_SERVICE_NAME || 'worker').trim() || 'worker',
    milestone: 6,
    shutdownGraceMs: parsePositiveInt(env.WORKER_SHUTDOWN_GRACE_MS, 8_000),
    healthEnabled: env.WORKER_HEALTH_ENABLED === undefined
      ? true
      : !['0', 'false', 'no', 'off'].includes(String(env.WORKER_HEALTH_ENABLED).trim().toLowerCase()),
    rabbit,
  });
}

function validateWorkerConfig(config = loadWorkerConfig()) {
  validateRabbitmqConfig(config.rabbit);
  return config;
}

module.exports = {
  loadWorkerConfig,
  validateWorkerConfig,
};
