/**
 * JWT configuration from environment variables.
 * The signing secret is never hard-coded and must never be logged.
 */

const PLACEHOLDER_SECRET = 'replace-with-a-long-random-secret';
const MIN_SECRET_LENGTH = 32;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function loadJwtConfig(env = process.env) {
  const raw = env.JWT_SECRET;
  const expiresRaw = env.JWT_EXPIRES_IN;

  return Object.freeze({
    secret: raw !== undefined ? String(raw) : '',
    expiresIn:
      expiresRaw !== undefined && String(expiresRaw).trim() !== ''
        ? String(expiresRaw).trim()
        : '1h',
    secretSpecified: raw !== undefined,
  });
}

/**
 * @param {ReturnType<typeof loadJwtConfig>} [jwt]
 * @param {{ envName?: string }} [options]
 */
function validateJwtConfig(jwt = loadJwtConfig(), options = {}) {
  const envName = options.envName || process.env.NODE_ENV || 'development';

  if (!jwt.secretSpecified || jwt.secret.trim() === '') {
    const error = new Error(
      'Missing required JWT configuration: JWT_SECRET. Set it in the environment (see .env.example).',
    );
    error.code = 'JWT_CONFIG_MISSING';
    throw error;
  }

  if (jwt.secret.length < MIN_SECRET_LENGTH) {
    const error = new Error(
      `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`,
    );
    error.code = 'JWT_CONFIG_INVALID';
    throw error;
  }

  if (envName === 'production' && jwt.secret === PLACEHOLDER_SECRET) {
    const error = new Error(
      'JWT_SECRET must not use the example placeholder in production.',
    );
    error.code = 'JWT_CONFIG_INVALID';
    throw error;
  }
}

module.exports = {
  loadJwtConfig,
  validateJwtConfig,
  PLACEHOLDER_SECRET,
  MIN_SECRET_LENGTH,
};
