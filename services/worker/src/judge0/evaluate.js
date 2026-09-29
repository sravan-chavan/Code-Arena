/**
 * Deterministic stdout comparison for CodeArena correctness evaluation.
 * Judge0 CE/RE/TLE/internal failures are preserved; "ran successfully" is not
 * treated as Accepted until output matches the expected test case.
 */

const { EXECUTION_STATUS } = require('./mapping');

const JUDGE0_FAILURE_STATUSES = new Set([
  EXECUTION_STATUS.COMPILATION_ERROR,
  EXECUTION_STATUS.RUNTIME_ERROR,
  EXECUTION_STATUS.TIME_LIMIT_EXCEEDED,
  EXECUTION_STATUS.INTERNAL_ERROR,
]);

function normalizeOutput(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+$/g, '');
}

function outputsMatch(actual, expected) {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

function isExecutionFailure(status) {
  return JUDGE0_FAILURE_STATUSES.has(status);
}

/**
 * @param {{ status: string, stdout: string | null }} mapped
 * @param {string | null} expectedOutput
 */
function verdictForCase(mapped, expectedOutput) {
  if (isExecutionFailure(mapped.status)) {
    return mapped.status;
  }
  if (expectedOutput === null || expectedOutput === undefined) {
    return mapped.status;
  }
  return outputsMatch(mapped.stdout, expectedOutput)
    ? EXECUTION_STATUS.ACCEPTED
    : EXECUTION_STATUS.WRONG_ANSWER;
}

module.exports = {
  normalizeOutput,
  outputsMatch,
  isExecutionFailure,
  verdictForCase,
};
