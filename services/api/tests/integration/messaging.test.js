const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { applyTestRabbitEnv } = require('./helpers');
const { loadRabbitmqConfig } = require('../../src/config/rabbitmq');
const { getPublishChannel } = require('../../src/messaging/connection');
const { handleSystemTest } = require('../../src/messaging/handlers/system-test.handler');
const {
  initMessaging,
  closeMessaging,
  publish,
  consume,
  cancelConsumer,
  startSystemConsumer,
  stopConsumers,
  isMessagingReady,
  MESSAGE_TYPES,
} = require('../../src/messaging');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(fn, timeoutMs = 5000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch (err) {
      lastError = err;
    }
    await sleep(50);
  }
  if (lastError) {
    throw lastError;
  }
  throw new Error('Timed out waiting for RabbitMQ condition');
}

function managementBase() {
  const port = process.env.RABBITMQ_MANAGEMENT_PORT || '15672';
  return `http://127.0.0.1:${port}`;
}

async function management(pathname, options = {}) {
  const user = process.env.RABBITMQ_USER;
  const password = process.env.RABBITMQ_PASSWORD;
  const response = await fetch(`${managementBase()}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `RabbitMQ management ${pathname} failed with HTTP ${response.status}. Check that the management UI port is published.`,
    );
  }
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function payloadText(entry) {
  if (!entry || entry.payload === undefined || entry.payload === null) {
    return '';
  }
  if (entry.payload_encoding === 'base64') {
    return Buffer.from(entry.payload, 'base64').toString('utf8');
  }
  return String(entry.payload);
}

async function peekQueue(queueName) {
  const entries = await management(`/api/queues/%2F/${encodeURIComponent(queueName)}/get`, {
    method: 'POST',
    body: JSON.stringify({
      count: 50,
      ackmode: 'ack_requeue_true',
      encoding: 'auto',
    }),
  });
  return Array.isArray(entries) ? entries : [];
}

function messageMatches(entry, messageId) {
  if (!entry) {
    return false;
  }
  if (entry.properties && entry.properties.message_id === messageId) {
    return true;
  }
  try {
    const parsed = JSON.parse(payloadText(entry));
    return parsed.messageId === messageId;
  } catch {
    return false;
  }
}

async function deadLetterFor(messageId, queueName) {
  const entries = await peekQueue(queueName);
  return entries.find((entry) => messageMatches(entry, messageId)) || null;
}

async function purgeApplicationQueues() {
  const config = loadRabbitmqConfig();
  const channel = getPublishChannel();
  await channel.purgeQueue(config.systemQueue);
  await channel.purgeQueue(config.systemDeadQueue);
  await channel.purgeQueue(config.executionQueue);
  await channel.purgeQueue(config.executionDeadQueue);
}

async function declareProbeQueue() {
  const config = loadRabbitmqConfig();
  const channel = getPublishChannel();
  const asserted = await channel.assertQueue('', {
    exclusive: true,
    durable: false,
    autoDelete: true,
    arguments: {
      'x-dead-letter-exchange': config.deadLetterExchange,
      'x-dead-letter-routing-key': config.systemDeadLetterRoutingKey,
    },
  });
  await channel.bindQueue(asserted.queue, config.exchange, config.systemRoutingKey);
  return asserted.queue;
}

async function declareExecutionProbeQueue() {
  const config = loadRabbitmqConfig();
  const channel = getPublishChannel();
  const asserted = await channel.assertQueue('', {
    exclusive: true,
    durable: false,
    autoDelete: true,
    arguments: {
      'x-dead-letter-exchange': config.deadLetterExchange,
      'x-dead-letter-routing-key': config.executionDeadLetterRoutingKey,
    },
  });
  await channel.bindQueue(asserted.queue, config.exchange, config.executionRoutingKey);
  return asserted.queue;
}

describe('RabbitMQ integration', () => {
  before(async () => {
    applyTestRabbitEnv();
    try {
      await initMessaging();
      await initMessaging();
      await purgeApplicationQueues();
    } catch (err) {
      await closeMessaging().catch(() => {});
      const wrapped = new Error(
        'RabbitMQ is required for messaging integration tests. Start the CodeArena stack with: make docker-up-codearena. Then re-run: make db-test-codearena',
      );
      wrapped.cause = err;
      throw wrapped;
    }
  });

  after(async () => {
    await stopConsumers().catch(() => {});
    if (isMessagingReady()) {
      await purgeApplicationQueues().catch(() => {});
    }
    await closeMessaging();
  });

  it('initializes the same topology a second time', async () => {
    await initMessaging();
    assert.equal(isMessagingReady(), true);
  });

  it('connects and opens a confirm channel', () => {
    assert.equal(isMessagingReady(), true);
    const channel = getPublishChannel();
    assert.equal(typeof channel.waitForConfirms, 'function');
  });

  it('declares the exchange, system+execution queues, bindings, DLX, and DLQs', async () => {
    const config = loadRabbitmqConfig();
    const exchange = await management(`/api/exchanges/%2F/${encodeURIComponent(config.exchange)}`);
    const dlx = await management(`/api/exchanges/%2F/${encodeURIComponent(config.deadLetterExchange)}`);
    const queue = await management(`/api/queues/%2F/${encodeURIComponent(config.systemQueue)}`);
    const dlq = await management(`/api/queues/%2F/${encodeURIComponent(config.systemDeadQueue)}`);
    const executionQueue = await management(
      `/api/queues/%2F/${encodeURIComponent(config.executionQueue)}`,
    );
    const executionDlq = await management(
      `/api/queues/%2F/${encodeURIComponent(config.executionDeadQueue)}`,
    );
    const queueBindings = await management(
      `/api/bindings/%2F/e/${encodeURIComponent(config.exchange)}/q/${encodeURIComponent(config.systemQueue)}`,
    );
    const dlqBindings = await management(
      `/api/bindings/%2F/e/${encodeURIComponent(config.deadLetterExchange)}/q/${encodeURIComponent(config.systemDeadQueue)}`,
    );
    const executionBindings = await management(
      `/api/bindings/%2F/e/${encodeURIComponent(config.exchange)}/q/${encodeURIComponent(config.executionQueue)}`,
    );

    assert.equal(exchange.type, 'topic');
    assert.equal(exchange.durable, true);
    assert.equal(dlx.type, 'direct');
    assert.equal(dlx.durable, true);
    assert.equal(queue.durable, true);
    assert.equal(queue.arguments['x-dead-letter-exchange'], config.deadLetterExchange);
    assert.equal(queue.arguments['x-dead-letter-routing-key'], config.systemDeadLetterRoutingKey);
    assert.equal(dlq.durable, true);
    assert.equal(dlq.arguments['x-dead-letter-exchange'], undefined);
    assert.equal(executionQueue.durable, true);
    assert.equal(
      executionQueue.arguments['x-dead-letter-routing-key'],
      config.executionDeadLetterRoutingKey,
    );
    assert.equal(executionDlq.durable, true);
    assert.ok(queueBindings.some((binding) => binding.routing_key === config.systemRoutingKey));
    assert.ok(dlqBindings.some((binding) => binding.routing_key === config.systemDeadLetterRoutingKey));
    assert.ok(
      executionBindings.some((binding) => binding.routing_key === config.executionRoutingKey),
    );
  });

  it('publishes a contract envelope and the consumer acks it', async () => {
    const probeQueue = await declareProbeQueue();
    /** @type {any} */
    let received = null;
    const subscription = await consume(probeQueue, async (message) => {
      received = message;
    });

    try {
      const published = await publish({
        type: MESSAGE_TYPES.SYSTEM_TEST,
        payload: { note: 'ack-path' },
      });

      await waitFor(() => received && received.messageId === published.messageId);
      assert.equal(received.type, published.type);
      assert.equal(received.version, 1);
      assert.equal(received.occurredAt, published.occurredAt);
      assert.deepEqual(received.payload, { note: 'ack-path' });

      await waitFor(async () => {
        const status = await getPublishChannel().checkQueue(probeQueue);
        return status.messageCount === 0;
      });
      assert.equal(await deadLetterFor(published.messageId, loadRabbitmqConfig().systemDeadQueue), null);
    } finally {
      await cancelConsumer(subscription.consumerTag);
      await getPublishChannel().deleteQueue(probeQueue).catch(() => {});
      await purgeApplicationQueues();
    }
  });

  it('dead-letters a failed handler from the system queue', async () => {
    const config = loadRabbitmqConfig();
    await purgeApplicationQueues();
    const subscription = await consume(config.systemQueue, handleSystemTest);

    try {
      const published = await publish({
        type: MESSAGE_TYPES.SYSTEM_TEST,
        payload: { disposition: 'fail', probe: 'dlq' },
      });

      const dead = await waitFor(() => deadLetterFor(published.messageId, config.systemDeadQueue));
      const deaths = dead.properties
        && dead.properties.headers
        && dead.properties.headers['x-death'];
      assert.ok(Array.isArray(deaths));
      assert.equal(deaths[0].reason, 'rejected');
      assert.equal(deaths[0].queue, config.systemQueue);
      assert.equal(deaths[0].exchange, config.exchange);
    } finally {
      await cancelConsumer(subscription.consumerTag);
      await purgeApplicationQueues();
    }
  });

  it('dead-letters a malformed body without invoking a successful handler', async () => {
    const config = loadRabbitmqConfig();
    await purgeApplicationQueues();
    let handlerCalled = false;
    const subscription = await consume(config.systemQueue, async () => {
      handlerCalled = true;
    });
    const probeId = '11111111-1111-4111-8111-111111111111';

    try {
      const channel = getPublishChannel();
      await new Promise((resolve, reject) => {
        channel.publish(
          config.exchange,
          config.routingKey,
          Buffer.from('not-json', 'utf8'),
          {
            persistent: true,
            mandatory: true,
            contentType: 'application/json',
            messageId: probeId,
          },
          (err) => (err ? reject(err) : resolve()),
        );
      });

      const dead = await waitFor(() => deadLetterFor(probeId, config.systemDeadQueue));
      assert.equal(payloadText(dead), 'not-json');
      assert.equal(handlerCalled, false);
      const deaths = dead.properties.headers['x-death'];
      assert.equal(deaths[0].reason, 'rejected');
      assert.equal(deaths[0].queue, config.systemQueue);
    } finally {
      await cancelConsumer(subscription.consumerTag);
      await purgeApplicationQueues();
    }
  });

  it('registers a live consumer on the system queue (infrastructure probe only)', async () => {
    process.env.RABBITMQ_CONSUMER_ENABLED = 'true';
    const config = loadRabbitmqConfig();
    const subscription = await startSystemConsumer();
    assert.ok(subscription);
    const registered = await waitFor(async () => {
      const listed = await management('/api/consumers');
      if (!Array.isArray(listed)) {
        return null;
      }
      const match = listed.find((consumer) => consumer.consumer_tag === subscription.consumerTag);
      return match || null;
    }, 15000);
    assert.equal(registered.consumer_tag, subscription.consumerTag);
    assert.equal(registered.queue.name, config.systemQueue);
  });

  it('publishes an execution job that routes to a bound execution consumer', async () => {
    // Use an exclusive probe queue so this test does not race the Compose Worker
    // on codearena.execution. Topic exchange delivers a copy to every bound queue.
    const probeQueue = await declareExecutionProbeQueue();
    /** @type {any} */
    let received = null;
    const subscription = await consume(probeQueue, async (message) => {
      received = message;
    });

    try {
      const published = await publish({
        type: MESSAGE_TYPES.EXECUTION_REQUESTED,
        payload: { jobId: '00000000-0000-4000-8000-000000000077' },
      });

      await waitFor(() => received && received.messageId === published.messageId);
      assert.equal(received.type, MESSAGE_TYPES.EXECUTION_REQUESTED);
      assert.equal(received.payload.jobId, '00000000-0000-4000-8000-000000000077');
    } finally {
      await cancelConsumer(subscription.consumerTag);
      await getPublishChannel().deleteQueue(probeQueue).catch(() => {});
      await purgeApplicationQueues();
    }
  });
});
