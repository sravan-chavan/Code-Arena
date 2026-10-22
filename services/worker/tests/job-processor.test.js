const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const { MESSAGE_TYPES, MessageContractError } = require('@codearena/messaging');
const { validateExecutionJob } = require('../src/jobs/execution.job');
const { processJob, processExecutionJob } = require('../src/processor/job-processor');
const { loadWorkerConfig, validateWorkerConfig } = require('../src/config');
const {
  JUDGE0_STATUS,
  EXECUTION_STATUS,
  Judge0Error,
} = require('../src/judge0');

function envelope(payload, type = MESSAGE_TYPES.EXECUTION_REQUESTED) {
  return {
    messageId: randomUUID(),
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    payload,
  };
}

function pythonHelloPayload(extra = {}) {
  return {
    jobId: extra.jobId || randomUUID(),
    sourceCode: extra.sourceCode === undefined ? 'print("Hello CodeArena")' : extra.sourceCode,
    languageId: extra.languageId === undefined ? 71 : extra.languageId,
    stdin: extra.stdin,
    expectedOutput: extra.expectedOutput,
    cpuTimeLimit: extra.cpuTimeLimit,
    memoryLimit: extra.memoryLimit,
    disposition: extra.disposition,
    note: extra.note,
  };
}

function acceptedClient(overrides = {}) {
  return {
    async createSubmission() {
      return { token: 'tok-accepted' };
    },
    async getSubmission() {
      return {
        token: 'tok-accepted',
        stdout: 'Hello CodeArena\n',
        stderr: null,
        compile_output: null,
        message: null,
        exit_code: 0,
        exit_signal: null,
        time: '0.01',
        memory: 1024,
        status: { id: JUDGE0_STATUS.ACCEPTED, description: 'Accepted' },
        ...overrides,
      };
    },
  };
}

const judge0Config = Object.freeze({
  url: 'http://judge0.example:2358',
  authToken: '',
  pollIntervalMs: 1,
  maxPollAttempts: 5,
  requestTimeoutMs: 1000,
});

describe('Worker configuration', () => {
  it('loads Worker defaults and validates RabbitMQ + Judge0', () => {
    const config = loadWorkerConfig({
      RABBITMQ_USER: 'codearena',
      RABBITMQ_PASSWORD: 'secret',
      CODEARENA_SERVICE_NAME: 'worker',
      JUDGE0_URL: 'http://judge0:2358',
    });
    assert.equal(config.serviceName, 'worker');
    assert.equal(config.milestone, 7);
    assert.equal(config.rabbit.executionQueue, 'codearena.execution');
    assert.equal(config.judge0.url, 'http://judge0:2358');
    assert.equal(config.judge0.authToken, '');
    assert.equal(config.judge0.pollIntervalMs, 1000);
    assert.equal(config.judge0.maxPollAttempts, 30);
    validateWorkerConfig(config);
  });

  it('rejects missing RabbitMQ credentials', () => {
    assert.throws(
      () => validateWorkerConfig(loadWorkerConfig({
        JUDGE0_URL: 'http://judge0:2358',
      })),
      (err) => err.code === 'RABBITMQ_CONFIG_MISSING',
    );
  });

  it('rejects missing JUDGE0_URL', () => {
    assert.throws(
      () => validateWorkerConfig(loadWorkerConfig({
        RABBITMQ_USER: 'codearena',
        RABBITMQ_PASSWORD: 'secret',
      })),
      (err) => err.code === 'JUDGE0_CONFIG_MISSING',
    );
  });

  it('rejects an invalid JUDGE0_URL scheme', () => {
    assert.throws(
      () => validateWorkerConfig(loadWorkerConfig({
        RABBITMQ_USER: 'codearena',
        RABBITMQ_PASSWORD: 'secret',
        JUDGE0_URL: 'ftp://judge0:2358',
      })),
      (err) => err.code === 'JUDGE0_CONFIG_INVALID',
    );
  });
});

describe('Execution job contract', () => {
  it('requires a UUID jobId plus Judge0 source and language', () => {
    const job = validateExecutionJob(envelope(pythonHelloPayload({
      jobId: '00000000-0000-4000-8000-000000000001',
      note: 'ok',
    })));
    assert.equal(job.jobId, '00000000-0000-4000-8000-000000000001');
    assert.equal(job.languageId, 71);
    assert.equal(job.sourceCode, 'print("Hello CodeArena")');
    assert.equal(job.disposition, null);
  });

  it('allows optional stdin, expectedOutput, and limits', () => {
    const job = validateExecutionJob(envelope(pythonHelloPayload({
      stdin: '1 2',
      expectedOutput: '3\n',
      cpuTimeLimit: 2.5,
      memoryLimit: 128000,
    })));
    assert.equal(job.stdin, '1 2');
    assert.equal(job.expectedOutput, '3\n');
    assert.equal(job.cpuTimeLimit, 2.5);
    assert.equal(job.memoryLimit, 128000);
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
    assert.throws(
      () => validateExecutionJob(envelope({ jobId: randomUUID() })),
      (err) => err instanceof MessageContractError && /sourceCode/.test(err.message),
    );
  });

  it('does not require Judge0 fields for disposition=fail probes', () => {
    const job = validateExecutionJob(envelope({
      jobId: '00000000-0000-4000-8000-000000000009',
      disposition: 'fail',
    }));
    assert.equal(job.disposition, 'fail');
    assert.equal(job.sourceCode, null);
  });
});

describe('Job processor', () => {
  it('processes a valid execution through Judge0 to ACCEPTED', async () => {
    const message = envelope(pythonHelloPayload({
      jobId: '00000000-0000-4000-8000-000000000002',
    }));
    const result = await processJob(message, {
      judge0Client: acceptedClient(),
      judge0Config,
    });
    assert.equal(result.status, EXECUTION_STATUS.ACCEPTED);
    assert.equal(result.jobId, message.payload.jobId);
    assert.equal(result.token, 'tok-accepted');
    assert.equal(result.stdout, 'Hello CodeArena\n');
    assert.equal(result.languageId, 71);
    assert.equal(result.milestone, 7);
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
      () => processJob(envelope(pythonHelloPayload(), MESSAGE_TYPES.SYSTEM_TEST)),
      (err) => err instanceof MessageContractError,
    );
  });

  it('allows M7 to inject an execution adapter via deps', async () => {
    let called = false;
    const message = envelope(pythonHelloPayload({
      jobId: '00000000-0000-4000-8000-000000000004',
    }));
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

  it('maps a terminal compilation error as successful processing', async () => {
    const message = envelope(pythonHelloPayload({
      jobId: '00000000-0000-4000-8000-000000000005',
      sourceCode: 'def (',
    }));
    const result = await processExecutionJob(
      validateExecutionJob(message),
      message,
      {
        judge0Client: acceptedClient({
          stdout: null,
          compile_output: 'SyntaxError',
          status: { id: JUDGE0_STATUS.COMPILATION_ERROR, description: 'Compilation Error' },
        }),
        judge0Config,
        publishResult: false,
      },
    );
    assert.equal(result.status, EXECUTION_STATUS.COMPILATION_ERROR);
    assert.equal(result.compileOutput, 'SyntaxError');
  });

  it('maps a terminal runtime error as successful processing', async () => {
    const message = envelope(pythonHelloPayload({
      jobId: '00000000-0000-4000-8000-000000000015',
      sourceCode: 'print(undefined_name)',
    }));
    const result = await processJob(message, {
      judge0Client: acceptedClient({
        stdout: null,
        stderr: 'NameError',
        exit_code: 1,
        status: { id: JUDGE0_STATUS.RUNTIME_ERROR_NZEC, description: 'Runtime Error (NZEC)' },
      }),
      judge0Config,
      publishResult: false,
    });
    assert.equal(result.status, EXECUTION_STATUS.RUNTIME_ERROR);
    assert.equal(result.stderr, 'NameError');
  });

  it('maps a terminal time-limit exceeded as successful processing', async () => {
    const message = envelope(pythonHelloPayload({
      jobId: '00000000-0000-4000-8000-000000000016',
      sourceCode: 'while True:\n    pass\n',
      cpuTimeLimit: 1,
    }));
    const result = await processJob(message, {
      judge0Client: acceptedClient({
        stdout: null,
        stderr: null,
        exit_code: null,
        status: { id: JUDGE0_STATUS.TIME_LIMIT_EXCEEDED, description: 'Time Limit Exceeded' },
      }),
      judge0Config,
      publishResult: false,
    });
    assert.equal(result.status, EXECUTION_STATUS.TIME_LIMIT_EXCEEDED);
  });

  it('forwards optional stdin and resource limits to Judge0 createSubmission', async () => {
    let captured;
    const message = envelope(pythonHelloPayload({
      jobId: '00000000-0000-4000-8000-000000000017',
      stdin: '1 2',
      expectedOutput: '3',
      cpuTimeLimit: 2.5,
      memoryLimit: 128000,
    }));
    await processJob(message, {
      judge0Client: {
        async createSubmission(submission) {
          captured = submission;
          return { token: 'tok-limits' };
        },
        async getSubmission() {
          return {
            token: 'tok-limits',
            stdout: '3\n',
            stderr: null,
            compile_output: null,
            message: null,
            exit_code: 0,
            time: '0.01',
            memory: 1024,
            status: { id: JUDGE0_STATUS.ACCEPTED, description: 'Accepted' },
          };
        },
      },
      judge0Config,
      publishResult: false,
    });
    assert.equal(captured.stdin, '1 2');
    assert.equal(captured.cpuTimeLimit, 2.5);
    assert.equal(captured.memoryLimit, 128000);
    assert.equal(captured.languageId, 71);
  });

  it('throws when Judge0 is unavailable so the consumer can NACK/DLQ', async () => {
    const message = envelope(pythonHelloPayload());
    await assert.rejects(
      () => processJob(message, {
        judge0Client: {
          async createSubmission() {
            throw new Judge0Error('Judge0 is unavailable', { code: 'JUDGE0_UNAVAILABLE' });
          },
          async getSubmission() {
            throw new Error('should not poll');
          },
        },
        judge0Config,
      }),
      (err) => err.code === 'JUDGE0_UNAVAILABLE',
    );
  });

  it('throws on Judge0 HTTP failure so the consumer can NACK/DLQ', async () => {
    const message = envelope(pythonHelloPayload());
    await assert.rejects(
      () => processJob(message, {
        judge0Client: {
          async createSubmission() {
            throw new Judge0Error('Judge0 HTTP 500', {
              code: 'JUDGE0_HTTP_ERROR',
              httpStatus: 500,
            });
          },
          async getSubmission() {
            throw new Error('should not poll');
          },
        },
        judge0Config,
      }),
      (err) => err instanceof Judge0Error
        && err.code === 'JUDGE0_HTTP_ERROR'
        && err.httpStatus === 500,
    );
  });

  it('throws on malformed Judge0 responses so the consumer can NACK/DLQ', async () => {
    const message = envelope(pythonHelloPayload());
    await assert.rejects(
      () => processJob(message, {
        judge0Client: {
          async createSubmission() {
            throw new Judge0Error('Judge0 create submission did not return a token', {
              code: 'JUDGE0_MALFORMED_RESPONSE',
            });
          },
          async getSubmission() {
            throw new Error('should not poll');
          },
        },
        judge0Config,
      }),
      (err) => err instanceof Judge0Error && err.code === 'JUDGE0_MALFORMED_RESPONSE',
    );
  });

  it('throws on poll exhaustion so the consumer can NACK/DLQ', async () => {
    const message = envelope(pythonHelloPayload());
    await assert.rejects(
      () => processJob(message, {
        judge0Client: {
          async createSubmission() {
            return { token: 'tok-stuck' };
          },
          async getSubmission() {
            return {
              token: 'tok-stuck',
              stdout: null,
              stderr: null,
              compile_output: null,
              message: null,
              status: { id: JUDGE0_STATUS.IN_QUEUE, description: 'In Queue' },
            };
          },
        },
        judge0Config: {
          ...judge0Config,
          maxPollAttempts: 2,
        },
        sleep: async () => {},
      }),
      (err) => err instanceof Judge0Error && err.code === 'JUDGE0_POLL_TIMEOUT',
    );
  });

  it('polls In Queue then Accepted before succeeding', async () => {
    const statuses = [
      { id: JUDGE0_STATUS.IN_QUEUE, description: 'In Queue' },
      { id: JUDGE0_STATUS.ACCEPTED, description: 'Accepted' },
    ];
    let poll = 0;
    const message = envelope(pythonHelloPayload());
    const result = await processJob(message, {
      judge0Client: {
        async createSubmission() {
          return { token: 'tok-poll' };
        },
        async getSubmission() {
          const status = statuses[Math.min(poll, statuses.length - 1)];
          poll += 1;
          return {
            token: 'tok-poll',
            stdout: status.id === JUDGE0_STATUS.ACCEPTED ? 'Hello CodeArena\n' : null,
            stderr: null,
            compile_output: null,
            message: null,
            exit_code: status.id === JUDGE0_STATUS.ACCEPTED ? 0 : null,
            time: '0.01',
            memory: 1024,
            status,
          };
        },
      },
      judge0Config,
      sleep: async () => {},
    });
    assert.equal(result.status, EXECUTION_STATUS.ACCEPTED);
    assert.equal(poll, 2);
  });

  it('maps a successful Judge0 run with mismatched stdout to WRONG_ANSWER', async () => {
    const message = envelope(pythonHelloPayload({
      expectedOutput: 'Hello CodeArena',
      sourceCode: 'print("nope")',
    }));
    const result = await processJob(message, {
      judge0Client: acceptedClient({ stdout: 'nope\n' }),
      judge0Config,
      publishResult: false,
    });
    assert.equal(result.status, EXECUTION_STATUS.WRONG_ANSWER);
  });

  it('evaluates every test case and publishes the completed payload', async () => {
    const tokens = [];
    const published = [];
    const message = envelope({
      jobId: '00000000-0000-4000-8000-000000000006',
      sourceCode: 'print(input())',
      languageId: 71,
      testCases: [
        { stdin: 'ok', expectedOutput: 'ok', points: 10 },
        { stdin: 'fail', expectedOutput: 'expected', points: 20 },
        { stdin: 'ok2', expectedOutput: 'ok2', points: 30 },
      ],
    });
    const result = await processJob(message, {
      judge0Client: {
        async createSubmission({ stdin }) {
          tokens.push(stdin);
          return { token: `tok-${stdin}` };
        },
        async getSubmission(token) {
          const stdin = token.replace('tok-', '');
          return {
            token,
            stdout: `${stdin}\n`,
            stderr: null,
            compile_output: null,
            message: null,
            exit_code: 0,
            time: '0.01',
            memory: 1024,
            status: { id: JUDGE0_STATUS.ACCEPTED, description: 'Accepted' },
          };
        },
      },
      judge0Config,
      publishResult: async (payload) => {
        published.push(payload);
      },
    });
    assert.equal(result.status, EXECUTION_STATUS.WRONG_ANSWER);
    assert.equal(result.testsPassed, 2);
    assert.equal(result.testsTotal, 3);
    assert.equal(result.score, 40);
    assert.deepEqual(tokens, ['ok', 'fail', 'ok2']);
    assert.equal(published.length, 1);
    assert.equal(published[0].status, EXECUTION_STATUS.WRONG_ANSWER);
    assert.equal(published[0].score, 40);
    assert.equal(published[0].testResults.length, 3);
  });

  it('accepts optional testCases on the execution job contract', () => {
    const job = validateExecutionJob(envelope({
      jobId: '00000000-0000-4000-8000-000000000007',
      sourceCode: 'print(1)',
      languageId: 71,
      testCases: [{ stdin: '1', expectedOutput: '1' }],
    }));
    assert.equal(job.testCases.length, 1);
    assert.equal(job.testCases[0].expectedOutput, '1');
  });
});
