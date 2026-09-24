const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  loadRabbitmqConfig,
  validateRabbitmqConfig,
  describeRabbitmqEndpoint,
} = require('../src/config/rabbitmq');
const { buildTopologyPlan } = require('../src/messaging/topology');
const {
  createMessage,
  parseMessage,
  serializeMessage,
  CONTRACT_VERSION,
} = require('../src/messaging/contract');
const { MessageContractError } = require('../src/messaging/errors');
const { MESSAGE_TYPES } = require('../src/messaging/routing');
const { decideAcknowledgement } = require('../src/messaging/consumer');
const { publish } = require('../src/messaging/producer');
const { connectWithRetry } = require('../src/messaging/connection');
const { handleSystemTest } = require('../src/messaging/handlers/system-test.handler');

describe('RabbitMQ configuration', () => {
  it('assembles an AMQP URL from Compose-style variables and keeps secrets out of the log description', () => {
    const config = loadRabbitmqConfig({
      RABBITMQ_HOST: 'rabbitmq',
      RABBITMQ_PORT: '5672',
      RABBITMQ_USER: 'codearena',
      RABBITMQ_PASSWORD: 'p@ss word',
      RABBITMQ_VHOST: '/',
    });

    assert.equal(config.urlSpecified, false);
    assert.equal(config.url, 'amqp://codearena:p%40ss%20word@rabbitmq:5672/');
    assert.equal(config.exchange, 'codearena.events');
    assert.equal(config.exchangeType, 'topic');
    assert.equal(config.deadLetterExchange, 'codearena.events.dlx');
    assert.equal(config.deadLetterExchangeType, 'direct');
    assert.equal(config.systemQueue, 'codearena.system');
    assert.equal(config.systemDeadQueue, 'codearena.system.dlq');
    assert.equal(config.routingKey, MESSAGE_TYPES.SYSTEM_TEST);
    assert.equal(config.consumerEnabled, true);

    const described = describeRabbitmqEndpoint(config);
    assert.match(described, /host=rabbitmq port=5672/);
    assert.equal(described.includes('p@ss'), false);
    assert.equal(described.includes('codearena'), false);
  });

  it('lets RABBITMQ_URL override the assembled URL', () => {
    const config = loadRabbitmqConfig({
      RABBITMQ_URL: 'amqps://example-user:secret@broker.internal:5671/lab',
      RABBITMQ_HOST: 'rabbitmq',
    });

    assert.equal(config.urlSpecified, true);
    assert.equal(config.url, 'amqps://example-user:secret@broker.internal:5671/lab');
    validateRabbitmqConfig(config);

    const described = describeRabbitmqEndpoint(config);
    assert.match(described, /host=broker\.internal port=5671 vhost=\/lab/);
    assert.equal(described.includes('secret'), false);
    assert.equal(described.includes('example-user'), false);
  });

  it('rejects missing credentials and non-AMQP URLs', () => {
    assert.throws(
      () => validateRabbitmqConfig(loadRabbitmqConfig({})),
      (err) => err.code === 'RABBITMQ_CONFIG_MISSING',
    );
    assert.throws(
      () => validateRabbitmqConfig(loadRabbitmqConfig({
        RABBITMQ_URL: 'http://localhost:15672',
      })),
      (err) => err.code === 'RABBITMQ_CONFIG_INVALID',
    );
  });

  it('can disable the architecture consumer explicitly', () => {
    const config = loadRabbitmqConfig({
      RABBITMQ_USER: 'codearena',
      RABBITMQ_PASSWORD: 'secret',
      RABBITMQ_CONSUMER_ENABLED: 'false',
    });
    assert.equal(config.consumerEnabled, false);
  });
});

describe('RabbitMQ topology plan', () => {
  it('declares a topic exchange, a direct DLX, one durable queue, and a DLQ', () => {
    const config = loadRabbitmqConfig({
      RABBITMQ_USER: 'codearena',
      RABBITMQ_PASSWORD: 'secret',
    });
    const plan = buildTopologyPlan(config);

    assert.deepEqual(
      plan.exchanges.map((exchange) => ({ name: exchange.name, type: exchange.type })),
      [
        { name: 'codearena.events', type: 'topic' },
        { name: 'codearena.events.dlx', type: 'direct' },
      ],
    );
    assert.equal(plan.queues[0].options.durable, true);
    assert.equal(
      plan.queues[0].options.arguments['x-dead-letter-exchange'],
      'codearena.events.dlx',
    );
    assert.equal(
      plan.queues[0].options.arguments['x-dead-letter-routing-key'],
      'codearena.system.test.dead',
    );
    assert.equal(plan.queues[1].name, 'codearena.system.dlq');
    assert.equal(plan.queues[1].options.durable, true);
    assert.equal(plan.queues[1].options.arguments, undefined);
    assert.deepEqual(plan.bindings, [
      {
        queue: 'codearena.system',
        exchange: 'codearena.events',
        routingKey: 'codearena.system.test',
      },
      {
        queue: 'codearena.system.dlq',
        exchange: 'codearena.events.dlx',
        routingKey: 'codearena.system.test.dead',
      },
    ]);
  });
});

describe('Message contract', () => {
  it('creates a versioned envelope and round-trips it', () => {
    const message = createMessage({
      type: MESSAGE_TYPES.SYSTEM_TEST,
      payload: { note: 'architecture' },
    });

    assert.match(message.messageId, /^[0-9a-f-]{36}$/i);
    assert.equal(message.type, 'codearena.system.test');
    assert.equal(message.version, CONTRACT_VERSION);
    assert.equal(Number.isNaN(Date.parse(message.occurredAt)), false);
    assert.deepEqual(message.payload, { note: 'architecture' });

    const parsed = parseMessage(serializeMessage(message));
    assert.deepEqual(parsed, message);
  });

  it('rejects unknown types, bad versions, and non-object payloads', () => {
    assert.throws(
      () => createMessage({ type: 'contest.created', payload: {} }),
      (err) => err instanceof MessageContractError && err.code === 'MESSAGE_CONTRACT_INVALID',
    );
    assert.throws(
      () => createMessage({ type: MESSAGE_TYPES.SYSTEM_TEST, payload: {}, version: 2 }),
      (err) => err instanceof MessageContractError,
    );
    assert.throws(
      () => createMessage({ type: MESSAGE_TYPES.SYSTEM_TEST, payload: [] }),
      (err) => err instanceof MessageContractError,
    );
    assert.throws(
      () => parseMessage(Buffer.from('not-json', 'utf8')),
      (err) => err instanceof MessageContractError,
    );
    assert.throws(
      () => parseMessage(Buffer.from(JSON.stringify({ hello: 'world' }), 'utf8')),
      (err) => err instanceof MessageContractError,
    );
  });
});

describe('Producer validation without a broker', () => {
  it('refuses an unknown type before it needs a connection', async () => {
    await assert.rejects(
      () => publish({ type: 'codearena.execution.requested', payload: {} }),
      (err) => err.code === 'MESSAGE_CONTRACT_INVALID',
    );
  });

  it('refuses a valid message when the client is not connected', async () => {
    await assert.rejects(
      () => publish({ type: MESSAGE_TYPES.SYSTEM_TEST, payload: { note: 'offline' } }),
      (err) => err.code === 'RABBITMQ_NOT_CONNECTED',
    );
  });
});

describe('Acknowledgement decisions', () => {
  it('acks success and rejects failures without requeue', () => {
    assert.deepEqual(decideAcknowledgement(null), { action: 'ack' });
    assert.deepEqual(decideAcknowledgement(new Error('handler blew up')), {
      action: 'reject',
      requeue: false,
      reason: 'handler',
    });
    assert.deepEqual(decideAcknowledgement(new MessageContractError('bad body')), {
      action: 'reject',
      requeue: false,
      reason: 'malformed',
    });
  });
});

describe('System test handler', () => {
  it('returns on a normal payload and throws when disposition is fail', async () => {
    await handleSystemTest({
      messageId: '00000000-0000-4000-8000-000000000001',
      type: MESSAGE_TYPES.SYSTEM_TEST,
      version: 1,
      occurredAt: '2026-09-23T12:00:00.000Z',
      payload: { note: 'ok' },
    });

    await assert.rejects(
      () => handleSystemTest({
        messageId: '00000000-0000-4000-8000-000000000002',
        type: MESSAGE_TYPES.SYSTEM_TEST,
        version: 1,
        occurredAt: '2026-09-23T12:00:00.000Z',
        payload: { disposition: 'fail' },
      }),
      (err) => err.code === 'SYSTEM_TEST_FAILED',
    );
  });
});

describe('RabbitMQ connection failure', () => {
  it('fails clearly when the broker cannot be reached', async () => {
    await assert.rejects(
      () => connectWithRetry('amqp://guest:guest@127.0.0.1:1/', {
        attempts: 2,
        delayMs: 10,
        timeoutMs: 200,
      }),
      (err) => err.code === 'RABBITMQ_UNAVAILABLE',
    );
  });
});
