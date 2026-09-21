/**
 * PostgreSQL configuration from environment variables.
 *
 * Application variables (preferred):
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *   DB_POOL_MIN, DB_POOL_MAX, DB_IDLE_TIMEOUT_MS, DB_CONNECTION_TIMEOUT_MS
 *
 * Docker Compose also injects POSTGRES_* for the database container.
 * Those names are accepted as fallbacks so the API can run in the existing stack
 * without duplicating secrets.
 *
 * Credentials are never hard-coded. Missing required values fail at pool init.
 */

function parseIntOrDefault(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function firstDefined(env, keys) {
  for (const key of keys) {
    if (env[key] !== undefined) {
      return env[key];
    }
  }
  return undefined;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function loadDatabaseConfig(env = process.env) {
  const passwordRaw = firstDefined(env, ['DB_PASSWORD', 'POSTGRES_PASSWORD']);
  const userRaw = firstDefined(env, ['DB_USER', 'POSTGRES_USER']);
  const nameRaw = firstDefined(env, ['DB_NAME', 'POSTGRES_DB']);
  const hostRaw = firstDefined(env, ['DB_HOST', 'POSTGRES_HOST']);

  return Object.freeze({
    host: hostRaw && String(hostRaw).trim() ? String(hostRaw).trim() : 'localhost',
    port: parseIntOrDefault(firstDefined(env, ['DB_PORT', 'POSTGRES_PORT']), 5432, {
      min: 1,
      max: 65535,
    }),
    name: nameRaw && String(nameRaw).trim() ? String(nameRaw).trim() : 'codearena',
    user: userRaw !== undefined ? String(userRaw) : '',
    password: passwordRaw !== undefined ? String(passwordRaw) : '',
    passwordSpecified: passwordRaw !== undefined,
    userSpecified: userRaw !== undefined,
    poolMin: parseIntOrDefault(env.DB_POOL_MIN, 0, { min: 0, max: 100 }),
    poolMax: parseIntOrDefault(env.DB_POOL_MAX, 10, { min: 1, max: 100 }),
    idleTimeoutMs: parseIntOrDefault(env.DB_IDLE_TIMEOUT_MS, 10_000, {
      min: 0,
      max: 600_000,
    }),
    connectionTimeoutMs: parseIntOrDefault(env.DB_CONNECTION_TIMEOUT_MS, 2_000, {
      min: 1,
      max: 120_000,
    }),
  });
}

/**
 * @param {ReturnType<typeof loadDatabaseConfig>} db
 * @returns {string[]} missing variable names
 */
function missingDatabaseConfig(db) {
  const missing = [];
  if (!db.host) {
    missing.push('DB_HOST');
  }
  if (!db.name) {
    missing.push('DB_NAME');
  }
  if (!db.userSpecified || db.user === '') {
    missing.push('DB_USER');
  }
  if (!db.passwordSpecified) {
    missing.push('DB_PASSWORD');
  }
  return missing;
}

/**
 * @param {ReturnType<typeof loadDatabaseConfig>} db
 */
function validateDatabaseConfig(db) {
  const missing = missingDatabaseConfig(db);
  if (missing.length > 0) {
    const error = new Error(
      `Missing required database configuration: ${missing.join(', ')}. Set them in the environment (see .env.example).`,
    );
    error.code = 'DB_CONFIG_MISSING';
    throw error;
  }
}

module.exports = {
  loadDatabaseConfig,
  missingDatabaseConfig,
  validateDatabaseConfig,
};
