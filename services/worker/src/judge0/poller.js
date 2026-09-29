/**
 * Polls Judge0 until a terminal status, a timeout, or abort.
 *
 * Never busy-loops. Never uses wait=true. Max attempts is a hard cap.
 */

const { Judge0Error } = require('./errors');
const { isTerminalJudge0Status, judge0StatusName } = require('./statuses');
const { mapJudge0Status } = require('./mapping');

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(new Judge0Error('Judge0 polling aborted', { code: 'JUDGE0_POLLING_ABORTED' }));
      return;
    }
    const timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new Judge0Error('Judge0 polling aborted', { code: 'JUDGE0_POLLING_ABORTED' }));
    }
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

/**
 * @param {{ getSubmission: (token: string) => Promise<Record<string, unknown>> }} client
 * @param {string} token
 * @param {{
 *   intervalMs: number,
 *   maxAttempts: number,
 *   signal?: AbortSignal,
 *   sleep?: typeof sleep,
 *   onStatusChange?: (info: {
 *     attempt: number,
 *     judge0StatusId: number,
 *     judge0StatusName: string,
 *     executionStatus: string,
 *   }) => void,
 * }} options
 */
async function pollUntilTerminal(client, token, options) {
  const intervalMs = options.intervalMs;
  const maxAttempts = options.maxAttempts;
  const sleepFn = options.sleep || sleep;
  const signal = options.signal;

  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Judge0Error('Judge0 polling maxAttempts must be a positive integer', {
      code: 'JUDGE0_CONFIG_INVALID',
    });
  }
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new Judge0Error('Judge0 polling intervalMs must be a positive integer', {
      code: 'JUDGE0_CONFIG_INVALID',
    });
  }

  let lastStatusId = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal && signal.aborted) {
      throw new Judge0Error('Judge0 polling aborted', { code: 'JUDGE0_POLLING_ABORTED' });
    }

    const submission = await client.getSubmission(token);
    const statusId = submission.status && submission.status.id;

    if (!Number.isInteger(statusId)) {
      throw new Judge0Error('Judge0 polling received a malformed status', {
        code: 'JUDGE0_MALFORMED_RESPONSE',
      });
    }

    if (statusId !== lastStatusId) {
      lastStatusId = statusId;
      if (typeof options.onStatusChange === 'function') {
        options.onStatusChange({
          attempt,
          judge0StatusId: statusId,
          judge0StatusName: judge0StatusName(statusId),
          executionStatus: mapJudge0Status(statusId),
        });
      }
    }

    if (isTerminalJudge0Status(statusId)) {
      return submission;
    }

    if (attempt === maxAttempts) {
      throw new Judge0Error(
        `Judge0 polling exhausted after ${maxAttempts} attempts token=${token}`,
        { code: 'JUDGE0_POLL_TIMEOUT' },
      );
    }

    await sleepFn(intervalMs, signal);
  }

  throw new Judge0Error(
    `Judge0 polling exhausted after ${maxAttempts} attempts token=${token}`,
    { code: 'JUDGE0_POLL_TIMEOUT' },
  );
}

module.exports = {
  pollUntilTerminal,
  sleep,
};
