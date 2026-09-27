const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const { MESSAGE_TYPES, MessageContractError } = require('@codearena/messaging');
const { validateExecutionJob } = require('../src/jobs/execution.job');
const { processJob, processExecutionJob } = require('../src/processor/job-processor');
const { loadWorkerConfig, validateWorkerConfig } = require('../src/config');

function envelope(payload, type = MESSAGE_TYPES.EXECUTION_REQUESTED) {
  return {
    messageId: randomUUID(),
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    payload,
  };
}

describe('Worker configuration', () => {
  it('loads Worker defaults and validates RabbitMQ credentials', () => {
    const config = loadWorkerConfig({
      RABBITMQ_USER: 'codearena',
      RABBITMQ_PASSWORD: 'secret',
      CODEARENA_SERVICE_NAME: 'worker',
    });
    assert.equal(config.serviceName, 'worker');
    assert.equal(config.milestone, 6);
    assert.equal(config.rabbit.executionQueue, 'codearena.execution');
    validateWorkerConfig(config);
  });

  it('rejects missing RabbitMQ credentials', () => {
    assert.throws(
      () => validateWorkerConfig(loadWorkerConfig({})),
      (err) => err.code === 'RABBITMQ_CONFIG_MISSING',
    );
  });
});

describe('Execution job contract', () => {
  it('requires a UUID jobId', () => {
    const job = validateExecutionJob(envelope({
      jobId: '00000000-0000-4000-8000-000000000001',
      note: 'ok',
    }));
    assert.equal(job.jobId, '00000000-0000-4000-8000-000000000001');
    assert.equal(job.disposition, null);
  });

  it('rejects invalid payloads and unsupported types', () => {
    assert.throws(
      () => validateExecutionJob(envelope({})),
      (err) => err instanceof MessageContractError,
    );
    assert.throws(
      () => validateExecutionJob(envelope({ jobId: 'not-a-uuid' })),
      (err) => err instanceof MessageContractError,
    );
    assert.throws(
      () => validateExecutionJob(envelope({ jobId: randomUUID() }, MESSAGE_TYPES.SYSTEM_TEST)),
      (err) => err instanceof MessageContractError,
    );
    assert.throws(
      () => validateExecutionJob(envelope({
        jobId: randomUUID(),
        disposition: 'retry-forever',
      })),
      (err) => err instanceof MessageContractError,
    );
  });
});

describe('Job processor', () => {
  it('processes a valid job at the M6 boundary', async () => {
    const message = envelope({ jobId: '00000000-0000-4000-8000-000000000002' });
    const result = await processJob(message);
    assert.equal(result.status, 'accepted');
    assert.equal(result.jobId, message.payload.jobId);
    assert.equal(result.milestone, 6);
  });

  it('throws for intentional disposition=fail without crashing the module', async () => {
    await assert.rejects(
      () => processJob(envelope({
        jobId: '00000000-0000-4000-8000-000000000003',
        disposition: 'fail',
      })),
      (err) => err.code === 'EXECUTION_JOB_FAILED',
    );
  });

  it('rejects unsupported message types before processing', async () => {
    await assert.rejects(
      () => processJob(envelope({ jobId: randomUUID() }, MESSAGE_TYPES.SYSTEM_TEST)),
      (err) => err instanceof MessageContractError,
    );
  });

  it('allows M7 to inject an execution adapter via deps', async () => {
    let called = false;
    const message = envelope({ jobId: '00000000-0000-4000-8000-000000000004' });
    const result = await processJob(message, {
      processExecution: async (job) => {
        called = true;
        assert.equal(job.jobId, message.payload.jobId);
        return { status: 'adapter', jobId: job.jobId };
      },
    });
    assert.equal(called, true);
    assert.equal(result.status, 'adapter');
  });

  it('exposes processExecutionJob as the M7 extension point', async () => {
    const message = envelope({ jobId: '00000000-0000-4000-8000-000000000005' });
    const job = validateExecutionJob(message);
    const result = await processExecutionJob(job, message);
    assert.equal(result.status, 'accepted');
  });
});
