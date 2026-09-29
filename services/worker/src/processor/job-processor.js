/**
 * Job processor — Worker processing boundary.
 *
 * Flow:
 *   consumer → processJob → validateExecutionJob → processExecutionJob
 *     → Judge0 createSubmission → pollUntilTerminal → map + evaluate → return
 *     → publish codearena.execution.completed (so the API can persist the result)
 *
 * Returning normally ACKs the RabbitMQ message (shared consumer).
 * Throwing rejects to the execution DLQ (M6 semantics).
 *
 * This module must not ack/reject AMQP messages or open RabbitMQ channels.
 */

const { MESSAGE_TYPES, MessageContractError, publish, isMessagingReady } = require('@codearena/messaging');
const { validateExecutionJob } = require('../jobs/execution.job');
const {
  createJudge0Client,
  loadJudge0Config,
  validateJudge0Config,
  pollUntilTerminal,
  mapJudge0Submission,
  judge0StatusName,
  EXECUTION_STATUS,
  verdictForCase,
} = require('../judge0');

function previewText(value, max = 80) {
  if (value === undefined || value === null) {
    return '';
  }
  const text = String(value).replace(/\s+/g, ' ').trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

function casesForJob(job) {
  if (job.testCases && job.testCases.length > 0) {
    return job.testCases;
  }
  return [{
    stdin: job.stdin || '',
    expectedOutput: job.expectedOutput,
  }];
}

async function publishCompleted(result, deps) {
  if (deps.publishResult === false) {
    return;
  }
  if (typeof deps.publishResult === 'function') {
    await deps.publishResult(result);
    return;
  }
  if (!isMessagingReady()) {
    return;
  }
  await publish({
    type: MESSAGE_TYPES.EXECUTION_COMPLETED,
    payload: {
      jobId: result.jobId,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      compileOutput: result.compileOutput,
      message: result.message,
      exitCode: result.exitCode,
      time: result.time,
      memory: result.memory,
      token: result.token,
      testsPassed: result.testsPassed,
      testsTotal: result.testsTotal,
      languageId: result.languageId,
    },
  });
}

async function runOneCase(client, poll, job, judge0Config, message, deps, testCase) {
  const created = await client.createSubmission({
    sourceCode: job.sourceCode,
    languageId: job.languageId,
    stdin: testCase.stdin,
    cpuTimeLimit: job.cpuTimeLimit,
    memoryLimit: job.memoryLimit,
  });

  console.log(
    `[WORKER] Judge0 submission created messageId=${message.messageId} jobId=${job.jobId} token=${created.token} languageId=${job.languageId}`,
  );
  console.log(
    `[WORKER] Judge0 polling started messageId=${message.messageId} token=${created.token}`,
  );

  const raw = await poll(client, created.token, {
    intervalMs: judge0Config.pollIntervalMs,
    maxAttempts: judge0Config.maxPollAttempts,
    signal: deps.signal,
    sleep: deps.sleep,
    onStatusChange: (info) => {
      console.log(
        `[WORKER] Judge0 status changed messageId=${message.messageId} token=${created.token} judge0Status=${info.judge0StatusName} codearenaStatus=${info.executionStatus} attempt=${info.attempt}`,
      );
    },
  });

  const mapped = mapJudge0Submission(raw);
  const status = verdictForCase(mapped, testCase.expectedOutput);
  const judge0Name = mapped.judge0StatusDescription || judge0StatusName(mapped.judge0StatusId);
  console.log(
    `[WORKER] Judge0 execution completed messageId=${message.messageId} token=${mapped.token} judge0Status=${judge0Name} codearenaStatus=${status} exitCode=${mapped.exitCode} time=${mapped.time} memory=${mapped.memory} stdoutPreview=${previewText(mapped.stdout)}`,
  );
  return Object.freeze({ ...mapped, status });
}

async function processJob(message, deps = {}) {
  const started = Date.now();
  console.log(
    `[WORKER] Job processing started messageId=${message && message.messageId} type=${message && message.type}`,
  );

  if (!message || message.type !== MESSAGE_TYPES.EXECUTION_REQUESTED) {
    throw new MessageContractError(
      `Unsupported message type for Worker processor: ${String(message && message.type)}`,
    );
  }

  const job = validateExecutionJob(message);
  const run = deps.processExecution || processExecutionJob;
  const result = await run(job, message, deps);

  const durationMs = Date.now() - started;
  console.log(
    `[WORKER] Job processing succeeded messageId=${message.messageId} jobId=${job.jobId} durationMs=${durationMs}`,
  );
  return result;
}

async function processExecutionJob(job, message, deps = {}) {
  if (job.disposition === 'fail') {
    const error = new Error('Execution job intentionally failed');
    error.code = 'EXECUTION_JOB_FAILED';
    console.error(
      `[WORKER] Job processing failed messageId=${message.messageId} jobId=${job.jobId} code=${error.code}`,
    );
    throw error;
  }

  const judge0Config = deps.judge0Config || (() => {
    const loaded = loadJudge0Config();
    validateJudge0Config(loaded);
    return loaded;
  })();
  const client = deps.judge0Client || createJudge0Client(judge0Config);
  const poll = deps.pollUntilTerminal || pollUntilTerminal;
  const cases = casesForJob(job);

  console.log(
    `[WORKER] Execution received messageId=${message.messageId} jobId=${job.jobId} languageId=${job.languageId} cases=${cases.length}`,
  );

  let last = null;
  let testsPassed = 0;
  let overall = EXECUTION_STATUS.ACCEPTED;

  for (const testCase of cases) {
    last = await runOneCase(client, poll, job, judge0Config, message, deps, testCase);
    if (last.status !== EXECUTION_STATUS.ACCEPTED) {
      overall = last.status;
      break;
    }
    testsPassed += 1;
  }

  const result = Object.freeze({
    ...last,
    status: overall,
    jobId: job.jobId,
    messageId: message.messageId,
    languageId: job.languageId,
    testsPassed,
    testsTotal: cases.length,
    milestone: 7,
  });

  console.log(
    `[WORKER] Execution processor completed messageId=${message.messageId} jobId=${job.jobId} status=${result.status} token=${result.token} tests=${testsPassed}/${cases.length}`,
  );

  await publishCompleted(result, deps);
  return result;
}

module.exports = {
  processJob,
  processExecutionJob,
};
