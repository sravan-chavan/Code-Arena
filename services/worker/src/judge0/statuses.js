/**
 * Official Judge0 CE status model.
 *
 * In-progress: In Queue (1), Processing (2).
 * Terminal: every other defined status (and any unknown id that is not 1 or 2).
 *
 * Do not scatter raw numeric comparisons across the Worker; use these helpers.
 */

const JUDGE0_STATUS = Object.freeze({
  IN_QUEUE: 1,
  PROCESSING: 2,
  ACCEPTED: 3,
  WRONG_ANSWER: 4,
  TIME_LIMIT_EXCEEDED: 5,
  COMPILATION_ERROR: 6,
  RUNTIME_ERROR_SIGSEGV: 7,
  RUNTIME_ERROR_SIGXFSZ: 8,
  RUNTIME_ERROR_SIGFPE: 9,
  RUNTIME_ERROR_SIGABRT: 10,
  RUNTIME_ERROR_NZEC: 11,
  RUNTIME_ERROR_OTHER: 12,
  INTERNAL_ERROR: 13,
  EXEC_FORMAT_ERROR: 14,
});

const JUDGE0_STATUS_NAME = Object.freeze({
  [JUDGE0_STATUS.IN_QUEUE]: 'In Queue',
  [JUDGE0_STATUS.PROCESSING]: 'Processing',
  [JUDGE0_STATUS.ACCEPTED]: 'Accepted',
  [JUDGE0_STATUS.WRONG_ANSWER]: 'Wrong Answer',
  [JUDGE0_STATUS.TIME_LIMIT_EXCEEDED]: 'Time Limit Exceeded',
  [JUDGE0_STATUS.COMPILATION_ERROR]: 'Compilation Error',
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGSEGV]: 'Runtime Error (SIGSEGV)',
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGXFSZ]: 'Runtime Error (SIGXFSZ)',
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGFPE]: 'Runtime Error (SIGFPE)',
  [JUDGE0_STATUS.RUNTIME_ERROR_SIGABRT]: 'Runtime Error (SIGABRT)',
  [JUDGE0_STATUS.RUNTIME_ERROR_NZEC]: 'Runtime Error (NZEC)',
  [JUDGE0_STATUS.RUNTIME_ERROR_OTHER]: 'Runtime Error (Other)',
  [JUDGE0_STATUS.INTERNAL_ERROR]: 'Internal Error',
  [JUDGE0_STATUS.EXEC_FORMAT_ERROR]: 'Exec Format Error',
});

const IN_PROGRESS_STATUS_IDS = Object.freeze([
  JUDGE0_STATUS.IN_QUEUE,
  JUDGE0_STATUS.PROCESSING,
]);

/**
 * @param {unknown} statusId
 * @returns {boolean}
 */
function isInProgressJudge0Status(statusId) {
  return statusId === JUDGE0_STATUS.IN_QUEUE || statusId === JUDGE0_STATUS.PROCESSING;
}

/**
 * Terminal means Judge0 has finished judging. Unknown ids other than 1 and 2
 * are treated as terminal so polling cannot loop forever.
 *
 * @param {unknown} statusId
 * @returns {boolean}
 */
function isTerminalJudge0Status(statusId) {
  if (!Number.isInteger(statusId) || statusId < 1) {
    return false;
  }
  return !isInProgressJudge0Status(statusId);
}

/**
 * @param {unknown} statusId
 * @returns {string}
 */
function judge0StatusName(statusId) {
  if (Object.prototype.hasOwnProperty.call(JUDGE0_STATUS_NAME, statusId)) {
    return JUDGE0_STATUS_NAME[statusId];
  }
  return `Unknown (${String(statusId)})`;
}

module.exports = {
  JUDGE0_STATUS,
  JUDGE0_STATUS_NAME,
  IN_PROGRESS_STATUS_IDS,
  isInProgressJudge0Status,
  isTerminalJudge0Status,
  judge0StatusName,
};
