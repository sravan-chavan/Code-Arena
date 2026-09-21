const { query } = require('./query');
const { logDatabaseError } = require('./errors');

/**
 * Live connectivity probe. Executes SELECT 1 — does not merely inspect the pool object.
 */
async function checkDatabase() {
  const started = process.hrtime.bigint();
  try {
    const result = await query('SELECT 1 AS ok');
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    const ok = Boolean(result.rows[0] && Number(result.rows[0].ok) === 1);
    return {
      ok,
      latencyMs: Math.round(latencyMs * 10) / 10,
    };
  } catch (err) {
    logDatabaseError('Database health check failed', err);
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    return {
      ok: false,
      latencyMs: Math.round(latencyMs * 10) / 10,
    };
  }
}

module.exports = {
  checkDatabase,
};
