const { getPool } = require('./pool');

/**
 * Execute a parameterized SQL query on the shared pool (or a transaction client).
 * Callers must pass user values via `params` — never interpolate into SQL.
 *
 * @param {string} text
 * @param {unknown[]} [params]
 * @param {import('pg').PoolClient} [client]
 */
async function query(text, params = [], client) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('SQL text is required');
  }
  if (params !== undefined && params !== null && !Array.isArray(params)) {
    throw new Error('Query parameters must be an array');
  }

  const executor = client || getPool();
  return executor.query(text, params);
}

/**
 * @param {string} text
 * @param {unknown[]} [params]
 * @param {import('pg').PoolClient} [client]
 */
async function queryOne(text, params = [], client) {
  const result = await query(text, params, client);
  return result.rows[0] ?? null;
}

module.exports = {
  query,
  queryOne,
};
