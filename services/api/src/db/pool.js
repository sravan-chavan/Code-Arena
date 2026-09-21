const { Pool } = require('pg');
const {
  loadDatabaseConfig,
  validateDatabaseConfig,
} = require('../config/database');
const { logDatabaseError } = require('./errors');

/** @type {import('pg').Pool | null} */
let pool = null;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Creates (or returns) the process-wide PostgreSQL pool.
 * The rest of the application must not construct pg clients directly.
 *
 * @param {Partial<ReturnType<typeof loadDatabaseConfig>>} [overrides]
 */
function initPool(overrides = {}) {
  if (pool) {
    return pool;
  }

  const db = Object.freeze({
    ...loadDatabaseConfig(),
    ...overrides,
  });
  validateDatabaseConfig(db);

  pool = new Pool({
    host: db.host,
    port: db.port,
    database: db.name,
    user: db.user,
    password: db.password,
    max: db.poolMax,
    idleTimeoutMillis: db.idleTimeoutMs,
    connectionTimeoutMillis: db.connectionTimeoutMs,
    allowExitOnIdle: true,
  });

  pool.on('error', (err) => {
    logDatabaseError('Idle PostgreSQL client error', err);
  });

  return pool;
}

function getPool() {
  if (!pool) {
    return initPool();
  }
  return pool;
}

function isPoolOpen() {
  return pool !== null;
}

/**
 * Acquire min connections then release them so the pool is warm.
 * node-postgres has no native pool min; this honors DB_POOL_MIN.
 *
 * @param {number} [min]
 */
async function warmPool(min) {
  const target = min === undefined ? loadDatabaseConfig().poolMin : min;
  if (!target || target < 1) {
    return;
  }

  const current = getPool();
  const clients = await Promise.all(
    Array.from({ length: target }, () => current.connect()),
  );
  for (const client of clients) {
    client.release();
  }
}

async function waitForDatabase({ attempts = 10, delayMs = 300 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await getPool().query('SELECT 1');
      return;
    } catch (err) {
      lastError = err;
      logDatabaseError(
        `Waiting for PostgreSQL (${attempt}/${attempts})`,
        err,
      );
      if (attempt < attempts) {
        await sleep(delayMs);
      }
    }
  }

  const error = new Error('PostgreSQL is not reachable');
  error.code = 'ECONNREFUSED';
  error.cause = lastError;
  throw error;
}

async function closePool() {
  if (!pool) {
    return;
  }
  const current = pool;
  pool = null;
  await current.end();
}

module.exports = {
  initPool,
  getPool,
  isPoolOpen,
  warmPool,
  waitForDatabase,
  closePool,
};
