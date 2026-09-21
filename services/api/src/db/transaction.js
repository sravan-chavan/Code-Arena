const { getPool } = require('./pool');
const { logDatabaseError } = require('./errors');

/**
 * Run `work` inside a PostgreSQL transaction.
 * Commits on success, rolls back on failure, always releases the client.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} work
 * @returns {Promise<T>}
 */
async function withTransaction(work) {
  if (typeof work !== 'function') {
    throw new Error('withTransaction requires a callback');
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logDatabaseError('Transaction rollback failed', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  withTransaction,
};
