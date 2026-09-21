const { query, queryOne } = require('../db/query');

/**
 * Data access for the internal app_meta table.
 * No HTTP concerns and no business-domain logic.
 *
 * @param {import('pg').QueryResultRow | null} row
 */
function mapRow(row) {
  if (!row) {
    return null;
  }
  return {
    key: row.key,
    value: row.value,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

/**
 * @param {string} key
 * @param {import('pg').PoolClient} [client]
 */
async function getByKey(key, client) {
  const row = await queryOne(
    `SELECT key, value, created_at, updated_at
     FROM app_meta
     WHERE key = $1`,
    [key],
    client,
  );
  return mapRow(row);
}

/**
 * @param {string} key
 * @param {string} value
 * @param {import('pg').PoolClient} [client]
 */
async function upsert(key, value, client) {
  const row = await queryOne(
    `INSERT INTO app_meta (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = NOW()
     RETURNING key, value, created_at, updated_at`,
    [key, value],
    client,
  );
  return mapRow(row);
}

/**
 * @param {string} key
 * @param {import('pg').PoolClient} [client]
 */
async function deleteByKey(key, client) {
  const result = await query('DELETE FROM app_meta WHERE key = $1', [key], client);
  return result.rowCount ?? 0;
}

module.exports = {
  getByKey,
  upsert,
  deleteByKey,
};
