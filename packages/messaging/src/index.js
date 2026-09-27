/**
 * Shared CodeArena messaging facade.
 *
 * Owns: connection lifecycle, topology, publish, consume helpers, and the M5
 * system-test handler registration (for infrastructure tests only).
 *
 * Does not own: HTTP routes, authentication, PostgreSQL, Judge0, or
 * submission/contest work.
 *
 * M6: API uses this package as a producer. Worker uses it as a consumer of
 * the execution queue. Do not start the system consumer from the API process.
 */

const { loadRabbitmqConfig, describeRabbitmqEndpoint, validateRabbitmqConfig } = require('./config');
const {
  initConnection,
  closeConnection,
  isConnected,
  getPublishChannel,
  getConnection,
  connectWithRetry,
  setUnexpectedCloseHandler,
} = require('./connection');
const { assertTopology, buildTopologyPlan } = require('./topology');
const { publish } = require('./producer');
const {
  consume,
  cancelConsumer,
  stopConsumers,
  decideAcknowledgement,
  handleDelivery,
  getInFlightCount,
  waitForInFlight,
} = require('./consumer');
const { handleSystemTest } = require('./handlers/system-test.handler');
const { MESSAGE_TYPES, DEAD_LETTER_ROUTING_KEYS } = require('./routing');
const {
  configureMessagingIdentity,
  getMessagingIdentity,
  messagingLogPrefix,
} = require('./identity');
const { MessagingError, MessageContractError, logMessagingError } = require('./errors');
const {
  CONTRACT_VERSION,
  createMessage,
  validateMessage,
  serializeMessage,
  parseMessage,
  isPlainObject,
  UUID_PATTERN,
} = require('./contract');

/** @type {{ consumerTag: string, queueName: string } | null} */
let systemConsumer = null;

async function initializeTopology() {
  return assertTopology(getPublishChannel(), loadRabbitmqConfig());
}

/**
 * Connects and declares exchanges, queues, and bindings.
 * Safe to call again: an existing connection is reused and assertions are idempotent.
 *
 * @param {{ serviceName?: string, appId?: string, logPrefix?: string }} [identityOptions]
 */
async function initMessaging(identityOptions = {}) {
  configureMessagingIdentity(identityOptions);
  await initConnection();
  const plan = await initializeTopology();
  const config = loadRabbitmqConfig();
  console.log(
    `${messagingLogPrefix()} RabbitMQ topology ready exchange=${config.exchange} systemQueue=${config.systemQueue} executionQueue=${config.executionQueue} ${describeRabbitmqEndpoint(config)}`,
  );
  return plan;
}

/**
 * Starts the architecture-only consumer on the system queue.
 * Intended for infrastructure tests — not for the API runtime after M6.
 * Disabled when RABBITMQ_CONSUMER_ENABLED=false.
 */
async function startSystemConsumer() {
  const config = loadRabbitmqConfig();
  if (!config.consumerEnabled) {
    console.log(`${messagingLogPrefix()} RabbitMQ system consumer disabled by RABBITMQ_CONSUMER_ENABLED`);
    return null;
  }
  if (systemConsumer) {
    return systemConsumer;
  }
  systemConsumer = await consume(config.systemQueue, handleSystemTest);
  return systemConsumer;
}

async function closeMessaging() {
  const active = systemConsumer;
  systemConsumer = null;
  if (active) {
    await cancelConsumer(active.consumerTag);
  }
  await stopConsumers();
  await closeConnection();
}

function isMessagingReady() {
  return isConnected();
}

module.exports = {
  initMessaging,
  initializeTopology,
  closeMessaging,
  publish,
  consume,
  cancelConsumer,
  startSystemConsumer,
  stopConsumers,
  isMessagingReady,
  decideAcknowledgement,
  handleDelivery,
  getInFlightCount,
  waitForInFlight,
  setUnexpectedCloseHandler,
  connectWithRetry,
  getPublishChannel,
  getConnection,
  initConnection,
  closeConnection,
  isConnected,
  buildTopologyPlan,
  assertTopology,
  loadRabbitmqConfig,
  describeRabbitmqEndpoint,
  validateRabbitmqConfig,
  configureMessagingIdentity,
  getMessagingIdentity,
  messagingLogPrefix,
  handleSystemTest,
  createMessage,
  validateMessage,
  serializeMessage,
  parseMessage,
  isPlainObject,
  UUID_PATTERN,
  CONTRACT_VERSION,
  MESSAGE_TYPES,
  DEAD_LETTER_ROUTING_KEYS,
  MessagingError,
  MessageContractError,
  logMessagingError,
};
