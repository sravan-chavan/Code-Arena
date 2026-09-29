const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  initMessaging,
  closeMessaging,
  publish,
  consume,
  cancelConsumer,
  getPublishChannel,
  isMessagingReady,
  loadRabbitmqConfig,
  MESSAGE_TYPES,
  configureMessagingIdentity,
} = require('@codearena/messaging');
const { createWorker } = require('../../src/lifecycle');
const { processJob } = require('../../src/processor/job-processor');
const { JUDGE0_STATUS } = require('../../src/judge0');

function loadRootEnv() {
  const envPath = path.join(__dirname, '..', '..', '..', '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function applyTestRabbitEnv() {
  process.env.NODE_ENV = 'test';
  loadRootEnv();
  delete process.env.RABBITMQ_URL;
  process.env.RABBITMQ_HOST = '127.0.0.1';
  process.env.RABBITMQ_PORT = process.env.RABBITMQ_PORT || '5672';
  process.env.RABBITMQ_USER = process.env.RABBITMQ_USER || 'codearena';
  if (process.env.RABBITMQ_PASSWORD === undefined) {
    process.env.RABBITMQ_PASSWORD = 'codearena_dev_password';
  }
  process.env.RABBITMQ_VHOST = process.env.RABBITMQ_VHOST || '/';
  process.env.RABBITMQ_MANAGEMENT_PORT = process.env.RABBITMQ_MANAGEMENT_PORT || '15672';
  process.env.RABBITMQ_CONSUMER_ENABLED = 'true';
  process.env.RABBITMQ_RECONNECT_ENABLED = 'false';
  process.env.CODEARENA_SERVICE_NAME = 'worker';
  process.env.WORKER_HEALTH_ENABLED = 'false';
  process.env.JUDGE0_URL = process.env.JUDGE0_URL || 'http://127.0.0.1:2358';
}

function pythonHelloPayload(extra = {}) {
  return {
    jobId: extra.jobId || randomUUID(),
    sourceCode: extra.sourceCode === undefined ? 'print("Hello CodeArena")' : extra.sourceCode,
    languageId: extra.languageId === undefined ? 71 : extra.languageId,
    ...extra,
  };
}

function fakeJudge0Client() {
  return {
    async createSubmission(submission) {
      if (submission && submission.sourceCode === '__fail_judge0__') {
        const error = new Error('Judge0 is unavailable');
        error.code = 'JUDGE0_UNAVAILABLE';
        throw error;
      }
      return { token: 'integration-token' };
    },
    async getSubmission() {
      return {
        token: 'integration-token',
        stdout: 'Hello CodeArena\n',
        stderr: null,
        compile_output: null,
        message: null,
        exit_code: 0,
        time: '0.01',
        memory: 1024,
        status: { id: JUDGE0_STATUS.ACCEPTED, description: 'Accepted' },
      };
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(fn, timeoutMs = 8000) {
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
  throw new Error('Timed out waiting for Worker/RabbitMQ condition');
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
    throw new Error(`RabbitMQ management ${pathname} failed with HTTP ${response.status}`);
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

async function deadLetterFor(messageId) {
  const config = loadRabbitmqConfig();
  const entries = await peekQueue(config.executionDeadQueue);
  return entries.find((entry) => messageMatches(entry, messageId)) || null;
}

async function purgeExecutionQueues() {
  const config = loadRabbitmqConfig();
  const channel = getPublishChannel();
  await channel.purgeQueue(config.executionQueue);
  await channel.purgeQueue(config.executionDeadQueue);
  if (config.executionResultQueue) {
    await channel.purgeQueue(config.executionResultQueue).catch(() => {});
    await channel.purgeQueue(config.executionResultDeadQueue).catch(() => {});
  }
}

describe('Worker RabbitMQ integration', () => {
  /** @type {ReturnType<typeof createWorker> | null} */
  let worker = null;

  before(async () => {
    applyTestRabbitEnv();
    configureMessagingIdentity({ serviceName: 'worker' });
    try {
      await initMessaging({ serviceName: 'worker' });
      await purgeExecutionQueues();
      await closeMessaging();
    } catch (err) {
      await closeMessaging().catch(() => {});
      const wrapped = new Error(
        'RabbitMQ is required for Worker integration tests. Start the CodeArena stack with: make docker-up-codearena',
      );
      wrapped.cause = err;
      throw wrapped;
    }
  });

  after(async () => {
    if (worker) {
      await worker.shutdown('test-cleanup').catch(() => {});
      worker = null;
    }
    if (isMessagingReady()) {
      await purgeExecutionQueues().catch(() => {});
      await closeMessaging().catch(() => {});
    }
  });

  it('starts, asserts topology, and registers the execution consumer', async () => {
    worker = createWorker({
      createHealthServer: false,
      judge0Client: fakeJudge0Client(),
    });
    await worker.start();
    const status = worker.getStatus();
    assert.equal(status.state, 'running');
    assert.equal(status.messagingReady, true);
    assert.ok(status.consumer);
    assert.equal(status.consumer.queueName, loadRabbitmqConfig().executionQueue);

    const consumers = await waitFor(async () => {
      const listed = await management('/api/consumers');
      return listed.find((entry) => entry.consumer_tag === status.consumer.consumerTag) || null;
    });
    assert.equal(consumers.queue.name, loadRabbitmqConfig().executionQueue);
  });

  it('ACKs a valid execution job after the processor succeeds', async () => {
    assert.ok(worker);
    const config = loadRabbitmqConfig();
    await purgeExecutionQueues();
    const jobId = randomUUID();
    const published = await publish({
      type: MESSAGE_TYPES.EXECUTION_REQUESTED,
      payload: pythonHelloPayload({ jobId, note: 'ack-path' }),
    });

    await waitFor(async () => {
      const queue = await management(`/api/queues/%2F/${encodeURIComponent(config.executionQueue)}`);
      return queue.messages === 0;
    });
    assert.equal(await deadLetterFor(published.messageId), null);
  });

  it('rejects invalid job payloads to the execution DLQ and stays alive', async () => {
    assert.ok(worker);
    const config = loadRabbitmqConfig();
    await purgeExecutionQueues();
    const published = await publish({
      type: MESSAGE_TYPES.EXECUTION_REQUESTED,
      payload: { note: 'missing-job-id' },
    });

    const dead = await waitFor(() => deadLetterFor(published.messageId));
    assert.ok(dead);
    assert.equal(worker.getStatus().state, 'running');
    const deaths = dead.properties.headers['x-death'];
    assert.equal(deaths[0].reason, 'rejected');
    assert.equal(deaths[0].queue, config.executionQueue);
  });

  it('rejects processor failures to the execution DLQ', async () => {
    assert.ok(worker);
    const config = loadRabbitmqConfig();
    await purgeExecutionQueues();
    const published = await publish({
      type: MESSAGE_TYPES.EXECUTION_REQUESTED,
      payload: { jobId: randomUUID(), disposition: 'fail' },
    });

    const dead = await waitFor(() => deadLetterFor(published.messageId));
    assert.ok(dead);
    assert.equal(dead.properties.headers['x-death'][0].queue, config.executionQueue);
    assert.equal(worker.getStatus().state, 'running');
  });

  it('rejects Judge0 communication failures to the execution DLQ', async () => {
    assert.ok(worker);
    const config = loadRabbitmqConfig();
    await purgeExecutionQueues();
    const published = await publish({
      type: MESSAGE_TYPES.EXECUTION_REQUESTED,
      payload: pythonHelloPayload({ sourceCode: '__fail_judge0__' }),
    });

    const dead = await waitFor(() => deadLetterFor(published.messageId));
    assert.ok(dead);
    assert.equal(dead.properties.headers['x-death'][0].queue, config.executionQueue);
    assert.equal(worker.getStatus().state, 'running');
  });

  it('rejects malformed JSON to the execution DLQ without crashing', async () => {
    assert.ok(worker);
    const config = loadRabbitmqConfig();
    await purgeExecutionQueues();
    const probeId = randomUUID();
    const channel = getPublishChannel();
    await new Promise((resolve, reject) => {
      channel.publish(
        config.exchange,
        config.executionRoutingKey,
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

    const dead = await waitFor(() => deadLetterFor(probeId));
    assert.equal(payloadText(dead), 'not-json');
    assert.equal(worker.getStatus().state, 'running');
  });

  it('supports competing consumers on the execution queue', async () => {
    assert.ok(worker);
    const config = loadRabbitmqConfig();
    await purgeExecutionQueues();

    /** @type {string[]} */
    const seen = [];
    const second = await consume(config.executionQueue, async (message) => {
      seen.push(message.messageId);
      await processJob(message, { judge0Client: fakeJudge0Client() });
    });

    try {
      const first = await publish({
        type: MESSAGE_TYPES.EXECUTION_REQUESTED,
        payload: pythonHelloPayload(),
      });
      const secondMsg = await publish({
        type: MESSAGE_TYPES.EXECUTION_REQUESTED,
        payload: pythonHelloPayload(),
      });

      await waitFor(async () => {
        const queue = await management(`/api/queues/%2F/${encodeURIComponent(config.executionQueue)}`);
        return queue.messages === 0;
      });

      // Both messages are processed exactly once by the application layer
      // (Worker consumer and/or the second test consumer). No app-level fan-out.
      const combined = new Set(seen);
      assert.ok(combined.size <= 2);
      assert.equal(await deadLetterFor(first.messageId), null);
      assert.equal(await deadLetterFor(secondMsg.messageId), null);
    } finally {
      await cancelConsumer(second.consumerTag);
    }
  });

  it('shuts down gracefully and closes RabbitMQ resources', async () => {
    assert.ok(worker);
    const tag = worker.getStatus().consumer && worker.getStatus().consumer.consumerTag;
    await worker.shutdown('test-shutdown');
    assert.equal(worker.getStatus().state, 'stopped');
    assert.equal(isMessagingReady(), false);

    if (tag) {
      const listed = await management('/api/consumers');
      assert.equal(
        listed.some((entry) => entry.consumer_tag === tag),
        false,
      );
    }
    worker = null;
  });
});
