const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pollUntilTerminal, isTerminalSubmission } = require('./controlledPoll');

describe('controlled submission polling', () => {
  it('stops when the submission reaches a terminal status', async () => {
    const calls = [];
    const result = await pollUntilTerminal(async () => {
      calls.push(calls.length);
      return calls.length < 3 ? { status: 'QUEUED' } : { status: 'ACCEPTED', score: 10 };
    }, {
      timeoutMs: 10000,
      backoffMs: [5, 5, 5],
      sleepFn: async () => {},
    });
    assert.equal(result.status, 'ACCEPTED');
    assert.equal(calls.length, 3);
    assert.equal(isTerminalSubmission({ status: 'QUEUED' }), false);
    assert.equal(isTerminalSubmission({ status: 'RUNNING' }), false);
  });

  it('stops when the caller aborts', async () => {
    const controller = new AbortController();
    let calls = 0;
    await assert.rejects(
      () => pollUntilTerminal(async () => {
        calls += 1;
        if (calls === 1) controller.abort();
        return { status: 'RUNNING' };
      }, {
        timeoutMs: 10000,
        backoffMs: [5],
        signal: controller.signal,
        sleepFn: async (_ms, signal) => {
          if (signal?.aborted) {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            throw error;
          }
        },
      }),
      (err) => err.name === 'AbortError',
    );
    assert.equal(calls, 1);
  });

  it('does not poll forever when the result never arrives', async () => {
    let calls = 0;
    await assert.rejects(
      () => pollUntilTerminal(async () => {
        calls += 1;
        return { status: 'QUEUED' };
      }, {
        timeoutMs: 25,
        backoffMs: [5, 5, 5, 5, 5],
        sleepFn: async (ms) => {
          await new Promise((resolve) => setTimeout(resolve, ms));
        },
      }),
      (err) => err.code === 'POLL_TIMEOUT',
    );
    assert.ok(calls >= 1);
    assert.ok(calls < 20);
  });
});
