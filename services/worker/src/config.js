/**
 * Worker configuration from environment variables.
 * Secrets are never hardcoded.
 */

const {
  loadRabbitmqConfig,
  validateRabbitmqConfig,
} = require('@codearena/messaging');
const {
  loadJudge0Config,
  validateJudge0Config,
} = require('./judge0/config');

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
  const judge0 = loadJudge0Config(env);

  return Object.freeze({
    env: nodeEnv,
    isProduction: nodeEnv === 'production',
    isTest: nodeEnv === 'test',
    port: parsePositiveInt(env.PORT, 4001),
    host: env.HOST || '0.0.0.0',
    serviceName: (env.CODEARENA_SERVICE_NAME || 'worker').trim() || 'worker',
    milestone: 7,
    shutdownGraceMs: parsePositiveInt(env.WORKER_SHUTDOWN_GRACE_MS, 8_000),
    healthEnabled: env.WORKER_HEALTH_ENABLED === undefined
      ? true
      : !['0', 'false', 'no', 'off'].includes(String(env.WORKER_HEALTH_ENABLED).trim().toLowerCase()),
    rabbit,
    judge0,
  });
}

function validateWorkerConfig(config = loadWorkerConfig()) {
  validateRabbitmqConfig(config.rabbit);
  validateJudge0Config(config.judge0);
  return config;
}

module.exports = {
  loadWorkerConfig,
  validateWorkerConfig,
};
