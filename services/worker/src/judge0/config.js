/**
 * Judge0 configuration from environment variables.
 * Secrets are never hardcoded. An empty auth token means Judge0 auth is off.
 */

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_MAX_POLL_ATTEMPTS = 30;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

function clean(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

/**
 * @param {unknown} value
 * @param {string} name
 * @param {number} fallback
 */
function parsePositiveInt(value, name, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    const error = new Error(`${name} must be a positive integer`);
    error.code = 'JUDGE0_CONFIG_INVALID';
    throw error;
  }
  return parsed;
}

/**
 * @param {string} url
 */
function normalizeJudge0Url(url) {
  return url.replace(/\/+$/, '');
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function loadJudge0Config(env = process.env) {
  const url = normalizeJudge0Url(clean(env.JUDGE0_URL));
  const authToken = env.JUDGE0_AUTH_TOKEN === undefined ? '' : String(env.JUDGE0_AUTH_TOKEN);

  return Object.freeze({
    url,
    authToken,
    pollIntervalMs: parsePositiveInt(
      env.JUDGE0_POLL_INTERVAL_MS,
      'JUDGE0_POLL_INTERVAL_MS',
      DEFAULT_POLL_INTERVAL_MS,
    ),
    maxPollAttempts: parsePositiveInt(
      env.JUDGE0_MAX_POLL_ATTEMPTS,
      'JUDGE0_MAX_POLL_ATTEMPTS',
      DEFAULT_MAX_POLL_ATTEMPTS,
    ),
    requestTimeoutMs: parsePositiveInt(
      env.JUDGE0_REQUEST_TIMEOUT_MS,
      'JUDGE0_REQUEST_TIMEOUT_MS',
      DEFAULT_REQUEST_TIMEOUT_MS,
    ),
  });
}

/**
 * @param {ReturnType<typeof loadJudge0Config>} config
 */
function validateJudge0Config(config) {
  if (!config.url) {
    const error = new Error(
      'Missing required Judge0 configuration: JUDGE0_URL. Set it in the environment (see .env.example).',
    );
    error.code = 'JUDGE0_CONFIG_MISSING';
    throw error;
  }

  let parsed;
  try {
    parsed = new URL(config.url);
  } catch {
    parsed = null;
  }
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    const error = new Error(
      'JUDGE0_URL must be an absolute http or https URL (for example http://judge0:2358).',
    );
    error.code = 'JUDGE0_CONFIG_INVALID';
    throw error;
  }
}

/**
 * Safe to log. Never includes the auth token.
 *
 * @param {ReturnType<typeof loadJudge0Config>} config
 */
function describeJudge0Endpoint(config) {
  return `url=${config.url} auth=${config.authToken ? 'configured' : 'disabled'}`;
}

module.exports = {
  loadJudge0Config,
  validateJudge0Config,
  describeJudge0Endpoint,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_MAX_POLL_ATTEMPTS,
  DEFAULT_REQUEST_TIMEOUT_MS,
};
