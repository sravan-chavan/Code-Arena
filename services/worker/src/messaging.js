/**
 * Worker messaging bootstrap.
 *
 * Connects, asserts topology (including execution queue), and registers the
 * execution consumer. Uses shared @codearena/messaging — no second AMQP stack.
 */

const {
  initMessaging,
  closeMessaging,
  consume,
  cancelConsumer,
  stopConsumers,
  waitForInFlight,
  setUnexpectedCloseHandler,
  isMessagingReady,
  loadRabbitmqConfig,
  MESSAGE_TYPES,
} = require('@codearena/messaging');
const { processJob } = require('./processor/job-processor');

/** @type {{ consumerTag: string, queueName: string } | null} */
let executionConsumer = null;

/**
 * @param {{ serviceName: string }} workerConfig
 * @param {{ onUnexpectedClose?: () => void, processJobFn?: typeof processJob }} [options]
 */
async function startWorkerMessaging(workerConfig, options = {}) {
  setUnexpectedCloseHandler(options.onUnexpectedClose || null);
  await initMessaging({ serviceName: workerConfig.serviceName });

  const rabbit = loadRabbitmqConfig();
  if (!rabbit.consumerEnabled) {
    console.log('[WORKER] RabbitMQ execution consumer disabled by RABBITMQ_CONSUMER_ENABLED');
    return { consumer: null, queueName: rabbit.executionQueue };
  }

  if (executionConsumer) {
    return { consumer: executionConsumer, queueName: executionConsumer.queueName };
  }

  const handler = options.processJobFn || processJob;
  executionConsumer = await consume(rabbit.executionQueue, async (message) => {
    if (message.type !== MESSAGE_TYPES.EXECUTION_REQUESTED) {
      const { MessageContractError } = require('@codearena/messaging');
      throw new MessageContractError(
        `Execution queue received unsupported type: ${message.type}`,
      );
    }
    await handler(message);
  });

  console.log(
    `[WORKER] Execution consumer active queue=${rabbit.executionQueue} consumerTag=${executionConsumer.consumerTag}`,
  );
  return { consumer: executionConsumer, queueName: rabbit.executionQueue };
}

/**
 * Stops accepting new jobs, waits for in-flight work, then closes messaging.
 *
 * @param {{ graceMs?: number }} [options]
 */
async function stopWorkerMessaging(options = {}) {
  const graceMs = options.graceMs === undefined ? 8_000 : options.graceMs;
  const active = executionConsumer;
  executionConsumer = null;
  setUnexpectedCloseHandler(null);

  if (active) {
    console.log(`[WORKER] Stopping consumer consumerTag=${active.consumerTag}`);
    await cancelConsumer(active.consumerTag);
  }

  const drained = await waitForInFlight(graceMs);
  if (!drained) {
    console.error(`[WORKER] In-flight job did not finish within ${graceMs}ms; closing anyway`);
  }

  await stopConsumers();
  await closeMessaging();
  console.log('[WORKER] RabbitMQ resources closed');
}

function isWorkerMessagingReady() {
  return isMessagingReady();
}

function getExecutionConsumer() {
  return executionConsumer;
}

module.exports = {
  startWorkerMessaging,
  stopWorkerMessaging,
  isWorkerMessagingReady,
  getExecutionConsumer,
};
