/**
 * CodeArena messaging facade.
 *
 * Owns: connection lifecycle, topology, publish, consume, and the M5
 * system-test handler registration.
 *
 * Does not own: HTTP routes, authentication, PostgreSQL, Judge0, or
 * submission/contest work.
 *
 * M6 is expected to move queue consumption into services/worker and leave
 * the API as the publisher. Do not add execution logic here.
 */

const { loadRabbitmqConfig, describeRabbitmqEndpoint } = require('../config/rabbitmq');
const { initConnection, closeConnection, isConnected, getPublishChannel } = require('./connection');
const { assertTopology } = require('./topology');
const { publish } = require('./producer');
const { consume, cancelConsumer, stopConsumers } = require('./consumer');
const { handleSystemTest } = require('./handlers/system-test.handler');
const { MESSAGE_TYPES, DEAD_LETTER_ROUTING_KEYS } = require('./routing');

/** @type {{ consumerTag: string, queueName: string } | null} */
let systemConsumer = null;

async function initializeTopology() {
  return assertTopology(getPublishChannel(), loadRabbitmqConfig());
}

/**
 * Connects and declares exchanges, queues, and bindings.
 * Safe to call again: an existing connection is reused and assertions are idempotent.
 */
async function initMessaging() {
  await initConnection();
  const plan = await initializeTopology();
  const config = loadRabbitmqConfig();
  console.log(
    `[API] RabbitMQ topology ready exchange=${config.exchange} queue=${config.systemQueue} dlq=${config.systemDeadQueue} ${describeRabbitmqEndpoint(config)}`,
  );
  return plan;
}

/**
 * Starts the architecture-only consumer on the system queue.
 * Disabled when RABBITMQ_CONSUMER_ENABLED=false.
 */
async function startSystemConsumer() {
  if (systemConsumer) {
    return systemConsumer;
  }
  const config = loadRabbitmqConfig();
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
  MESSAGE_TYPES,
  DEAD_LETTER_ROUTING_KEYS,
};
