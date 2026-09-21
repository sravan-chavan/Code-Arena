/**
 * Maps driver/PostgreSQL errors to safe HTTP-facing messages.
 * Never include connection strings, SQL, credentials, or stack traces.
 */

const CONNECTION_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '08P01',
  '28P01',
  '28000',
  '57P01',
  '57P02',
  '57P03',
  '53300',
]);

function isDatabaseError(err) {
  if (!err || typeof err !== 'object') {
    return false;
  }
  if (err.code === 'DB_CONFIG_MISSING') {
    return true;
  }
  if (CONNECTION_CODES.has(err.code)) {
    return true;
  }
  if (typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) && err.severity) {
    return true;
  }
  return false;
}

function sanitizeDatabaseError(err) {
  const code = err && err.code;
  if (code === 'DB_CONFIG_MISSING') {
    return { statusCode: 503, message: 'Database is unavailable' };
  }
  if (CONNECTION_CODES.has(code)) {
    return { statusCode: 503, message: 'Database is unavailable' };
  }
  return { statusCode: 500, message: 'Database error' };
}

function logDatabaseError(context, err) {
  const code = err && err.code ? err.code : 'UNKNOWN';
  const message = err && err.message ? err.message : 'unknown error';
  console.error(`[API] ${context}: code=${code} message=${message}`);
}

module.exports = {
  isDatabaseError,
  sanitizeDatabaseError,
  logDatabaseError,
};
