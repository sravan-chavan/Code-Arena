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

async function publishStarted(message, deps) {
  const payload = message && message.payload;
  if (!payload || typeof payload.jobId !== 'string') {
    return;
  }
  const body = {
    jobId: payload.jobId,
    contestId: typeof payload.contestId === 'string' ? payload.contestId : null,
    participantId: typeof payload.participantId === 'string' ? payload.participantId : null,
    questionId: typeof payload.questionId === 'string' ? payload.questionId : null,
    kind: payload.kind === 'run' || payload.kind === 'submit' ? payload.kind : null,
  };
  if (deps.publishStarted === false) {
    return;
  }
  if (typeof deps.publishStarted === 'function') {
    await deps.publishStarted(body);
    return;
  }
  if (!isMessagingReady()) {
    return;
  }
  try {
    await publish({
      type: MESSAGE_TYPES.EXECUTION_STARTED,
      payload: body,
    });
  } catch (err) {
    console.error(
      `[WORKER] Execution started publish failed jobId=${payload.jobId} message=${err.message}`,
    );
  }
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
      score: result.score,
      testResults: result.testResults,
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
  if (!testCase.isHidden) {
    console.log(
      `[WORKER] Judge0 execution completed messageId=${message.messageId} token=${mapped.token} judge0Status=${judge0Name} codearenaStatus=${status} exitCode=${mapped.exitCode} time=${mapped.time} memory=${mapped.memory} stdoutPreview=${previewText(mapped.stdout)}`,
    );
  } else {
    console.log(
      `[WORKER] Judge0 execution completed messageId=${message.messageId} token=${mapped.token} judge0Status=${judge0Name} codearenaStatus=${status} hidden=true`,
    );
  }
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
  await publishStarted(message, deps);

  console.log(
    `[WORKER] Execution received messageId=${message.messageId} jobId=${job.jobId} contestId=${job.contestId || 'none'} questionId=${job.questionId || 'none'} languageId=${job.languageId} cases=${cases.length}`,
  );

  let last = null;
  let testsPassed = 0;
  const testResults = [];

  for (const [index, testCase] of cases.entries()) {
    last = await runOneCase(client, poll, job, judge0Config, message, deps, testCase);
    const passed = last.status === EXECUTION_STATUS.ACCEPTED;
    if (passed) {
      testsPassed += 1;
    }
    const points = Number.isInteger(testCase.points) && testCase.points > 0 ? testCase.points : 10;
    testResults.push({
      testCaseId: testCase.id || null,
      sortOrder: Number.isInteger(testCase.sortOrder) ? testCase.sortOrder : index,
      isHidden: Boolean(testCase.isHidden),
      status: last.status,
      passed,
      points,
      pointsEarned: passed ? points : 0,
      time: last.time,
      memory: last.memory,
    });
  }

  const score = testResults.reduce((sum, row) => sum + Number(row.pointsEarned || 0), 0);
  let overall = EXECUTION_STATUS.ACCEPTED;
  if (testResults.some((row) => !row.passed)) {
    if (testResults.some((row) => row.passed)) {
      overall = EXECUTION_STATUS.WRONG_ANSWER;
    } else {
      overall = (last && last.status) || EXECUTION_STATUS.WRONG_ANSWER;
    }
  }

  const result = Object.freeze({
    ...last,
    status: overall,
    jobId: job.jobId,
    messageId: message.messageId,
    languageId: job.languageId,
    testsPassed,
    testsTotal: cases.length,
    score,
    testResults,
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
