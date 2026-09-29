/**
 * Isolated Judge0 HTTP client.
 *
 * createSubmission() → POST /submissions?base64_encoded=false&wait=false
 * getSubmission()    → GET  /submissions/{token}
 *
 * Never uses wait=true. Auth token is sent only when configured.
 * Callers inject `fetch` in tests; production uses global fetch.
 */

const { Judge0Error } = require('./errors');

const SUBMISSION_FIELDS = [
  'stdout',
  'stderr',
  'compile_output',
  'message',
  'exit_code',
  'exit_signal',
  'time',
  'memory',
  'token',
  'status',
].join(',');

/**
 * @param {ReturnType<typeof import('./config').loadJudge0Config>} config
 * @param {{ fetch?: typeof fetch }} [deps]
 */
function createJudge0Client(config, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch.bind(globalThis);
  const baseUrl = config.url;
  const authToken = config.authToken || '';
  const requestTimeoutMs = config.requestTimeoutMs;

  /**
   * @param {string} method
   * @param {string} pathname
   * @param {{ body?: Record<string, unknown> }} [options]
   */
  async function requestJson(method, pathname, options = {}) {
    const headers = {
      Accept: 'application/json',
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (authToken) {
      headers['X-Auth-Token'] = authToken;
    }

    let response;
    try {
      response = await fetchImpl(`${baseUrl}${pathname}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (err) {
      const name = err && typeof err === 'object' && 'name' in err ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new Judge0Error('Judge0 request timed out', {
          code: 'JUDGE0_TIMEOUT',
          cause: err,
        });
      }
      throw new Judge0Error('Judge0 is unavailable', {
        code: 'JUDGE0_UNAVAILABLE',
        cause: err,
      });
    }

    let payload = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Judge0Error('Judge0 returned malformed JSON', {
          code: 'JUDGE0_MALFORMED_RESPONSE',
          httpStatus: response.status,
        });
      }
    }

    if (!response.ok) {
      throw new Judge0Error(`Judge0 HTTP ${response.status}`, {
        code: 'JUDGE0_HTTP_ERROR',
        httpStatus: response.status,
        cause: payload,
      });
    }

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Judge0Error('Judge0 returned a malformed response body', {
        code: 'JUDGE0_MALFORMED_RESPONSE',
        httpStatus: response.status,
      });
    }

    return payload;
  }

  /**
   * @param {{
   *   sourceCode: string,
   *   languageId: number,
   *   stdin?: string | null,
   *   expectedOutput?: string | null,
   *   cpuTimeLimit?: number | null,
   *   memoryLimit?: number | null,
   * }} submission
   * @returns {Promise<{ token: string }>}
   */
  async function createSubmission(submission) {
    const body = {
      source_code: submission.sourceCode,
      language_id: submission.languageId,
    };
    if (submission.stdin !== undefined && submission.stdin !== null) {
      body.stdin = submission.stdin;
    }
    if (submission.expectedOutput !== undefined && submission.expectedOutput !== null) {
      body.expected_output = submission.expectedOutput;
    }
    if (submission.cpuTimeLimit !== undefined && submission.cpuTimeLimit !== null) {
      body.cpu_time_limit = submission.cpuTimeLimit;
    }
    if (submission.memoryLimit !== undefined && submission.memoryLimit !== null) {
      body.memory_limit = submission.memoryLimit;
    }

    const payload = await requestJson(
      'POST',
      '/submissions?base64_encoded=false&wait=false',
      { body },
    );

    if (typeof payload.token !== 'string' || payload.token.trim() === '') {
      throw new Judge0Error('Judge0 create submission did not return a token', {
        code: 'JUDGE0_MALFORMED_RESPONSE',
      });
    }

    return Object.freeze({ token: payload.token.trim() });
  }

  /**
   * @param {string} token
   */
  async function getSubmission(token) {
    if (typeof token !== 'string' || token.trim() === '') {
      throw new Judge0Error('Judge0 submission token is required', {
        code: 'JUDGE0_MALFORMED_RESPONSE',
      });
    }

    const payload = await requestJson(
      'GET',
      `/submissions/${encodeURIComponent(token)}?base64_encoded=false&fields=${SUBMISSION_FIELDS}`,
    );

    const status = payload.status;
    if (!status || typeof status !== 'object' || Array.isArray(status) || !Number.isInteger(status.id)) {
      throw new Judge0Error('Judge0 submission is missing a numeric status.id', {
        code: 'JUDGE0_MALFORMED_RESPONSE',
      });
    }

    return payload;
  }

  return Object.freeze({
    createSubmission,
    getSubmission,
  });
}

module.exports = {
  createJudge0Client,
  SUBMISSION_FIELDS,
};
