/**
 * Centralized API configuration from environment variables.
 * No secrets are hardcoded.
 */

const { loadDatabaseConfig } = require('./database');
const { loadJwtConfig } = require('./jwt');

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

const nodeEnv = process.env.NODE_ENV || 'development';

const config = Object.freeze({
  env: nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: parsePositiveInt(process.env.PORT, 4000),
  host: process.env.HOST || '0.0.0.0',
  serviceName: 'api',
  milestone: 4,
  bodyLimit: process.env.API_BODY_LIMIT || '100kb',
  db: loadDatabaseConfig(),
  jwt: loadJwtConfig(),
});

module.exports = config;
