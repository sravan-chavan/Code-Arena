/**
 * Bounded submission polling used only when the WebSocket is not authoritative.
 * Stops on a terminal status, abort, or timeout. Delays back off and then hold.
 */

const DEFAULT_BACKOFF_MS = Object.freeze([1000, 2000, 3000, 5000]);

const TERMINAL_SUBMISSION_STATUSES = new Set([
  'ACCEPTED',
  'WRONG_ANSWER',
  'TIME_LIMIT_EXCEEDED',
  'COMPILATION_ERROR',
  'RUNTIME_ERROR',
  'INTERNAL_ERROR',
]);

function abortError() {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  error.code = 'ABORTED';
  return error;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isTerminalSubmission(submission) {
  return Boolean(submission && TERMINAL_SUBMISSION_STATUSES.has(submission.status));
}

async function pollUntilTerminal(fetchOnce, {
  timeoutMs = 45000,
  backoffMs = DEFAULT_BACKOFF_MS,
  isTerminal = isTerminalSubmission,
  signal,
  sleepFn = sleep,
} = {}) {
  const started = Date.now();
  let attempt = 0;
  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted) {
      throw abortError();
    }
    const value = await fetchOnce();
    if (isTerminal(value)) {
      return value;
    }
    const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)];
    attempt += 1;
    if (Date.now() - started + delay >= timeoutMs) {
      break;
    }
    await sleepFn(delay, signal);
  }
  const error = new Error('Timed out waiting for the execution result.');
  error.code = 'POLL_TIMEOUT';
  throw error;
}

module.exports = {
  DEFAULT_BACKOFF_MS,
  TERMINAL_SUBMISSION_STATUSES,
  isTerminalSubmission,
  pollUntilTerminal,
  sleep,
};
