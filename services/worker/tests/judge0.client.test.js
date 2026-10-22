const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createJudge0Client, Judge0Error } = require('../src/judge0');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      if (body === undefined) {
        return '';
      }
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
}

function clientWithFetch(fetchImpl, config = {}) {
  return createJudge0Client({
    url: 'http://judge0.example:2358',
    authToken: '',
    requestTimeoutMs: 1000,
    pollIntervalMs: 10,
    maxPollAttempts: 3,
    ...config,
  }, { fetch: fetchImpl });
}

describe('Judge0 client', () => {
  it('creates a submission and extracts the token', async () => {
    let captured;
    const client = clientWithFetch(async (url, options) => {
      captured = { url, options };
      return jsonResponse(201, { token: 'abc-token' });
    });

    const created = await client.createSubmission({
      sourceCode: 'print("Hello CodeArena")',
      languageId: 71,
      stdin: '',
    });

    assert.equal(created.token, 'abc-token');
    assert.equal(captured.url, 'http://judge0.example:2358/submissions?base64_encoded=false&wait=false');
    assert.equal(captured.options.method, 'POST');
    const body = JSON.parse(captured.options.body);
    assert.equal(body.source_code, 'print("Hello CodeArena")');
    assert.equal(body.language_id, 71);
    assert.equal(body.stdin, '');
    assert.equal(captured.options.headers['X-Auth-Token'], undefined);
  });

  it('forwards optional stdin, expected_output, and limits on create', async () => {
    let body;
    const client = clientWithFetch(async (_url, options) => {
      body = JSON.parse(options.body);
      return jsonResponse(201, { token: 'opt-token' });
    });

    await client.createSubmission({
      sourceCode: 'print(int(input()) + 1)',
      languageId: 71,
      stdin: '2',
      expectedOutput: '3\n',
      cpuTimeLimit: 1.5,
      memoryLimit: 64000,
    });

    assert.equal(body.stdin, '2');
    assert.equal(body.expected_output, '3\n');
    assert.equal(body.cpu_time_limit, 1.5);
    assert.equal(body.memory_limit, 64000);
  });

  it('sends X-Auth-Token when an auth token is configured', async () => {
    let headers;
    const client = clientWithFetch(async (_url, options) => {
      headers = options.headers;
      return jsonResponse(201, { token: 'tok' });
    }, { authToken: 'judge0-secret' });

    await client.createSubmission({ sourceCode: 'x', languageId: 71 });
    assert.equal(headers['X-Auth-Token'], 'judge0-secret');
  });

  it('omits the auth header when the token is empty', async () => {
    let headers;
    const client = clientWithFetch(async (_url, options) => {
      headers = options.headers;
      return jsonResponse(201, { token: 'tok' });
    }, { authToken: '' });

    await client.createSubmission({ sourceCode: 'x', languageId: 71 });
    assert.equal(Object.prototype.hasOwnProperty.call(headers, 'X-Auth-Token'), false);
  });

  it('throws on HTTP failure when creating a submission', async () => {
    const client = clientWithFetch(async () => jsonResponse(500, { error: 'boom' }));
    await assert.rejects(
      () => client.createSubmission({ sourceCode: 'x', languageId: 71 }),
      (err) => err instanceof Judge0Error && err.code === 'JUDGE0_HTTP_ERROR' && err.httpStatus === 500,
    );
  });

  it('throws when the create response is missing a token', async () => {
    const client = clientWithFetch(async () => jsonResponse(201, { ok: true }));
    await assert.rejects(
      () => client.createSubmission({ sourceCode: 'x', languageId: 71 }),
      (err) => err instanceof Judge0Error && err.code === 'JUDGE0_MALFORMED_RESPONSE',
    );
  });

  it('throws when Judge0 returns non-JSON', async () => {
    const client = clientWithFetch(async () => jsonResponse(200, 'not-json'));
    await assert.rejects(
      () => client.createSubmission({ sourceCode: 'x', languageId: 71 }),
      (err) => err instanceof Judge0Error && err.code === 'JUDGE0_MALFORMED_RESPONSE',
    );
  });

  it('throws JUDGE0_UNAVAILABLE when fetch fails', async () => {
    const client = clientWithFetch(async () => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(
      () => client.createSubmission({ sourceCode: 'x', languageId: 71 }),
      (err) => err instanceof Judge0Error && err.code === 'JUDGE0_UNAVAILABLE',
    );
  });

  it('retrieves a submission result', async () => {
    let capturedUrl;
    const client = clientWithFetch(async (url) => {
      capturedUrl = url;
      return jsonResponse(200, {
        token: 'abc-token',
        stdout: 'Hello CodeArena\n',
        stderr: null,
        compile_output: null,
        message: null,
        exit_code: 0,
        time: '0.01',
        memory: 1024,
        status: { id: 3, description: 'Accepted' },
      });
    });

    const submission = await client.getSubmission('abc-token');
    assert.equal(submission.status.id, 3);
    assert.equal(submission.stdout, 'Hello CodeArena\n');
    assert.match(capturedUrl, /\/submissions\/abc-token\?/);
    assert.match(capturedUrl, /base64_encoded=false/);
  });

  it('throws when getSubmission status.id is missing', async () => {
    const client = clientWithFetch(async () => jsonResponse(200, { token: 'abc-token' }));
    await assert.rejects(
      () => client.getSubmission('abc-token'),
      (err) => err instanceof Judge0Error && err.code === 'JUDGE0_MALFORMED_RESPONSE',
    );
  });
});
