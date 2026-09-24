/**
 * RabbitMQ configuration from environment variables.
 *
 * Compose already injects the broker as separate parts:
 *   RABBITMQ_HOST, RABBITMQ_PORT, RABBITMQ_USER, RABBITMQ_PASSWORD
 *
 * Those remain the source of truth so this milestone does not invent a second
 * credential system. RABBITMQ_URL, when set, overrides the assembled URL.
 *
 * Exchange names, queue names, and routing keys are read here. Application
 * code must not embed broker hostnames, credentials, or topology names.
 */

const {
  MESSAGE_TYPES,
  DEAD_LETTER_ROUTING_KEYS,
} = require('../messaging/routing');

const DEFAULT_EXCHANGE = 'codearena.events';
const DEFAULT_DLX = 'codearena.events.dlx';
const DEFAULT_SYSTEM_QUEUE = 'codearena.system';
const DEFAULT_SYSTEM_DLQ = 'codearena.system.dlq';

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

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function clean(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

/**
 * @param {{ user: string, password: string, host: string, port: number, vhost: string }} parts
 */
function buildAmqpUrl(parts) {
  const user = encodeURIComponent(parts.user);
  const password = encodeURIComponent(parts.password);
  const vhostPath = parts.vhost === '/' ? '/' : `/${encodeURIComponent(parts.vhost)}`;
  return `amqp://${user}:${password}@${parts.host}:${parts.port}${vhostPath}`;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function loadRabbitmqConfig(env = process.env) {
  const urlOverride = clean(env.RABBITMQ_URL);
  const host = clean(env.RABBITMQ_HOST) || 'localhost';
  const port = parseIntOrDefault(env.RABBITMQ_PORT, 5672, { min: 1, max: 65535 });
  const user = clean(env.RABBITMQ_USER);
  const password = env.RABBITMQ_PASSWORD !== undefined ? String(env.RABBITMQ_PASSWORD) : '';
  const vhost = clean(env.RABBITMQ_VHOST) || '/';

  return Object.freeze({
    url: urlOverride || buildAmqpUrl({ user, password, host, port, vhost }),
    urlSpecified: urlOverride !== '',
    host,
    port,
    user,
    password,
    vhost,
    userSpecified: user !== '',
    passwordSpecified: env.RABBITMQ_PASSWORD !== undefined,
    exchange: clean(env.RABBITMQ_EXCHANGE) || DEFAULT_EXCHANGE,
    exchangeType: 'topic',
    deadLetterExchange: clean(env.RABBITMQ_DLX) || DEFAULT_DLX,
    deadLetterExchangeType: 'direct',
    systemQueue: clean(env.RABBITMQ_SYSTEM_QUEUE) || DEFAULT_SYSTEM_QUEUE,
    systemDeadQueue: clean(env.RABBITMQ_SYSTEM_DLQ) || DEFAULT_SYSTEM_DLQ,
    routingKey: MESSAGE_TYPES.SYSTEM_TEST,
    deadLetterRoutingKey: DEAD_LETTER_ROUTING_KEYS.SYSTEM_TEST,
    prefetch: parseIntOrDefault(env.RABBITMQ_PREFETCH, 1, { min: 1, max: 1000 }),
    consumerEnabled: parseBoolean(env.RABBITMQ_CONSUMER_ENABLED, true),
    connectAttempts: parseIntOrDefault(env.RABBITMQ_CONNECT_ATTEMPTS, 10, { min: 1, max: 100 }),
    connectDelayMs: parseIntOrDefault(env.RABBITMQ_CONNECT_DELAY_MS, 300, { min: 0, max: 60_000 }),
    connectionTimeoutMs: parseIntOrDefault(env.RABBITMQ_CONNECTION_TIMEOUT_MS, 10_000, {
      min: 100,
      max: 120_000,
    }),
  });
}

/**
 * @param {ReturnType<typeof loadRabbitmqConfig>} rabbit
 * @returns {string[]}
 */
function missingRabbitmqConfig(rabbit) {
  if (rabbit.urlSpecified) {
    return [];
  }
  const missing = [];
  if (!rabbit.userSpecified) {
    missing.push('RABBITMQ_USER');
  }
  if (!rabbit.passwordSpecified) {
    missing.push('RABBITMQ_PASSWORD');
  }
  return missing;
}

/**
 * @param {ReturnType<typeof loadRabbitmqConfig>} rabbit
 */
function validateRabbitmqConfig(rabbit) {
  const missing = missingRabbitmqConfig(rabbit);
  if (missing.length > 0) {
    const error = new Error(
      `Missing required RabbitMQ configuration: ${missing.join(', ')}. Set them in the environment (see .env.example).`,
    );
    error.code = 'RABBITMQ_CONFIG_MISSING';
    throw error;
  }

  let protocol;
  try {
    protocol = new URL(rabbit.url).protocol;
  } catch {
    protocol = '';
  }
  if (protocol !== 'amqp:' && protocol !== 'amqps:') {
    const error = new Error(
      'RabbitMQ URL must use the amqp or amqps scheme. Set RABBITMQ_URL or RABBITMQ_HOST/PORT/USER/PASSWORD.',
    );
    error.code = 'RABBITMQ_CONFIG_INVALID';
    throw error;
  }
}

/**
 * Endpoint description safe to log. Never includes the user or password.
 *
 * @param {ReturnType<typeof loadRabbitmqConfig>} rabbit
 */
function describeRabbitmqEndpoint(rabbit) {
  try {
    const parsed = new URL(rabbit.url);
    const vhost = decodeURIComponent(parsed.pathname || '/');
    const port = parsed.port || '5672';
    return `host=${parsed.hostname} port=${port} vhost=${vhost || '/'}`;
  } catch {
    return `host=${rabbit.host} port=${rabbit.port} vhost=${rabbit.vhost}`;
  }
}

module.exports = {
  loadRabbitmqConfig,
  missingRabbitmqConfig,
  validateRabbitmqConfig,
  describeRabbitmqEndpoint,
  buildAmqpUrl,
  DEFAULT_EXCHANGE,
  DEFAULT_DLX,
  DEFAULT_SYSTEM_QUEUE,
  DEFAULT_SYSTEM_DLQ,
};
