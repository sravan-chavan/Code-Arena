const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { initPool, closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');

function loadRootEnv() {
  const envPath = path.join(__dirname, '..', '..', '..', '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function applyTestDatabaseEnv() {
  process.env.NODE_ENV = 'test';
  loadRootEnv();
  process.env.DB_HOST =
    process.env.DB_HOST || process.env.POSTGRES_HOST || '127.0.0.1';
  process.env.DB_PORT =
    process.env.DB_PORT || process.env.POSTGRES_PORT || '5432';
  process.env.DB_NAME =
    process.env.DB_NAME || process.env.POSTGRES_DB || 'codearena';
  process.env.DB_USER =
    process.env.DB_USER || process.env.POSTGRES_USER || 'codearena';
  if (process.env.DB_PASSWORD === undefined) {
    process.env.DB_PASSWORD =
      process.env.POSTGRES_PASSWORD || 'codearena_dev_password';
  }
  process.env.DB_CONNECTION_TIMEOUT_MS =
    process.env.DB_CONNECTION_TIMEOUT_MS || '2000';
  process.env.DB_POOL_MAX = process.env.DB_POOL_MAX || '5';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'test-only-jwt-secret-not-for-production-use';
  process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
}

function uniqueEmail(prefix = 'user') {
  return `${prefix}-${process.pid}-${randomUUID()}@example.com`;
}

async function requirePostgres() {
  applyTestDatabaseEnv();
  await closePool();
  initPool();
  try {
    await query('SELECT 1 AS ok');
  } catch (err) {
    await closePool().catch(() => {});
    const wrapped = new Error(
      'PostgreSQL is required for database integration tests. Start the CodeArena stack with: make docker-up-codearena. Then re-run: make db-test-codearena',
    );
    wrapped.cause = err;
    throw wrapped;
  }
}

function uniqueKey(prefix) {
  return `test:${prefix}:${process.pid}:${randomUUID()}`;
}

/**
 * The development Test contest is an open-ended running seed (migration 006).
 * Restore that invariant so later suites are not poisoned if an earlier
 * lifecycle test or Admin End action closed it.
 */
async function restoreOpenEndedTestContest() {
  await query(`
    UPDATE contests
    SET status = 'running',
        start_time = NULL,
        end_time = NULL,
        updated_at = NOW()
    WHERE is_development_seed = TRUE
      AND title = 'Test'
  `);
}

/**
 * Host-side RabbitMQ settings for integration tests.
 * The API container uses hostname `rabbitmq`. Tests run on the host, so they
 * use the published port on 127.0.0.1 and ignore RABBITMQ_URL.
 */
function applyTestRabbitEnv() {
  process.env.NODE_ENV = 'test';
  loadRootEnv();
  delete process.env.RABBITMQ_URL;
  process.env.RABBITMQ_HOST = '127.0.0.1';
  process.env.RABBITMQ_PORT = process.env.RABBITMQ_PORT || '5672';
  process.env.RABBITMQ_USER = process.env.RABBITMQ_USER || 'codearena';
  if (process.env.RABBITMQ_PASSWORD === undefined) {
    process.env.RABBITMQ_PASSWORD = 'codearena_dev_password';
  }
  process.env.RABBITMQ_VHOST = process.env.RABBITMQ_VHOST || '/';
  process.env.RABBITMQ_MANAGEMENT_PORT = process.env.RABBITMQ_MANAGEMENT_PORT || '15672';
}

module.exports = {
  applyTestDatabaseEnv,
  applyTestRabbitEnv,
  requirePostgres,
  uniqueKey,
  uniqueEmail,
  restoreOpenEndedTestContest,
};
