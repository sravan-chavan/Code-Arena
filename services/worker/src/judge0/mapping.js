/**
 * Central mapping from Judge0 statuses to CodeArena execution statuses.
 *
 * Application code should use EXECUTION_STATUS, not raw Judge0 ids.
 */

const { JUDGE0_STATUS, judge0StatusName } = require('./statuses');

const EXECUTION_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  ACCEPTED: 'ACCEPTED',
  WRONG_ANSWER: 'WRONG_ANSWER',
  TIME_LIMIT_EXCEEDED: 'TIME_LIMIT_EXCEEDED',
  COMPILATION_ERROR: 'COMPILATION_ERROR',
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

const JUDGE0_TO_EXECUTION_STATUS = Object.freeze({
  [JUDGE0_STATUS.IN_QUEUE]: EXECUTION_STATUS.QUEUED,
  [JUDGE0_STATUS.PROCESSING]: EXECUTION_STATUS.RUNNING,
  [JUDGE0_STATUS.ACCEPTED]: EXECUTION_STATUS.ACCEPTED,
  [JUDGE0_STATUS.WRONG_ANSWER]: EXECUTION_STATUS.WRONG_ANSWER,
  [JUDGE0_STATUS.TIME_LIMIT_EXCEEDED]: EXECUTION_STATUS.TIME_LIMIT_EXCEEDED,
  [JUDGE0_STATUS.COMPILATION_ERROR]: EXECUTION_STATUS.COMPILATION_ERROR,
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGSEGV]: EXECUTION_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGXFSZ]: EXECUTION_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGFPE]: EXECUTION_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGABRT]: EXECUTION_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS.RUNTIME_ERROR_NZEC]: EXECUTION_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS.RUNTIME_ERROR_OTHER]: EXECUTION_STATUS.RUNTIME_ERROR,
  [JUDGE0_STATUS.INTERNAL_ERROR]: EXECUTION_STATUS.INTERNAL_ERROR,
  [JUDGE0_STATUS.EXEC_FORMAT_ERROR]: EXECUTION_STATUS.RUNTIME_ERROR,
});

/**
 * @param {unknown} judge0StatusId
 * @returns {typeof EXECUTION_STATUS[keyof typeof EXECUTION_STATUS]}
 */
function mapJudge0Status(judge0StatusId) {
  if (Object.prototype.hasOwnProperty.call(JUDGE0_TO_EXECUTION_STATUS, judge0StatusId)) {
    return JUDGE0_TO_EXECUTION_STATUS[judge0StatusId];
  }
  return EXECUTION_STATUS.INTERNAL_ERROR;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function nullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  return String(value);
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function nullableNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Maps a Judge0 submission payload into a CodeArena execution result.
 * Does not include source code.
 *
 * @param {Record<string, unknown>} submission
 */
function mapJudge0Submission(submission) {
  const status = submission && typeof submission.status === 'object' && submission.status !== null
    ? submission.status
    : {};
  const judge0StatusId = Number.isInteger(status.id) ? status.id : null;
  const judge0StatusDescription = typeof status.description === 'string'
    ? status.description
    : judge0StatusName(judge0StatusId);

  return Object.freeze({
    status: mapJudge0Status(judge0StatusId),
    judge0StatusId,
    judge0StatusDescription,
    token: typeof submission.token === 'string' ? submission.token : null,
    stdout: nullableString(submission.stdout),
    stderr: nullableString(submission.stderr),
    compileOutput: nullableString(submission.compile_output),
    message: nullableString(submission.message),
    exitCode: nullableNumber(submission.exit_code),
    exitSignal: nullableNumber(submission.exit_signal),
    time: nullableString(submission.time),
    memory: nullableNumber(submission.memory),
  });
}

module.exports = {
  EXECUTION_STATUS,
  JUDGE0_TO_EXECUTION_STATUS,
  mapJudge0Status,
  mapJudge0Submission,
};
