const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  pollUntilTerminal,
  Judge0Error,
  JUDGE0_STATUS,
  EXECUTION_STATUS,
} = require('../src/judge0');

function statusPayload(id, extra = {}) {
  return {
    token: 'tok',
    stdout: extra.stdout === undefined ? null : extra.stdout,
    stderr: extra.stderr === undefined ? null : extra.stderr,
    compile_output: extra.compile_output === undefined ? null : extra.compile_output,
    message: extra.message === undefined ? null : extra.message,
    status: { id, description: extra.description || String(id) },
  };
}

function sequenceClient(payloads) {
  let index = 0;
  return {
    async getSubmission() {
      const payload = payloads[Math.min(index, payloads.length - 1)];
      index += 1;
      if (typeof payload === 'function') {
        return payload();
      }
      return payload;
    },
  };
}

async function noopSleep() {}

const pollOptions = {
  intervalMs: 5,
  maxAttempts: 5,
  sleep: noopSleep,
};

describe('Judge0 polling', () => {
  it('polls In Queue → Processing → Accepted', async () => {
    const changes = [];
    const client = sequenceClient([
      statusPayload(JUDGE0_STATUS.IN_QUEUE),
      statusPayload(JUDGE0_STATUS.PROCESSING),
      statusPayload(JUDGE0_STATUS.ACCEPTED, { stdout: 'Hello CodeArena\n' }),
    ]);

    const result = await pollUntilTerminal(client, 'tok', {
      ...pollOptions,
      onStatusChange: (info) => changes.push(info.executionStatus),
    });

    assert.equal(result.status.id, JUDGE0_STATUS.ACCEPTED);
    assert.deepEqual(changes, [
      EXECUTION_STATUS.QUEUED,
      EXECUTION_STATUS.RUNNING,
      EXECUTION_STATUS.ACCEPTED,
    ]);
  });

  const terminals = [
    [JUDGE0_STATUS.WRONG_ANSWER, 'Wrong Answer'],
    [JUDGE0_STATUS.COMPILATION_ERROR, 'Compilation Error'],
    [JUDGE0_STATUS.TIME_LIMIT_EXCEEDED, 'Time Limit Exceeded'],
    [JUDGE0_STATUS.RUNTIME_ERROR_NZEC, 'Runtime Error'],
    [JUDGE0_STATUS.INTERNAL_ERROR, 'Internal Error'],
  ];

  for (const [id, label] of terminals) {
    it(`stops at terminal ${label}`, async () => {
      const client = sequenceClient([statusPayload(id)]);
      const result = await pollUntilTerminal(client, 'tok', pollOptions);
      assert.equal(result.status.id, id);
    });
  }

  it('throws JUDGE0_POLL_TIMEOUT when max attempts are reached', async () => {
    const client = sequenceClient([statusPayload(JUDGE0_STATUS.IN_QUEUE)]);
    await assert.rejects(
      () => pollUntilTerminal(client, 'tok', {
        intervalMs: 1,
        maxAttempts: 3,
        sleep: noopSleep,
      }),
      (err) => err instanceof Judge0Error && err.code === 'JUDGE0_POLL_TIMEOUT',
    );
  });

  it('propagates Judge0 unavailability', async () => {
    const client = {
      async getSubmission() {
        throw new Judge0Error('Judge0 is unavailable', { code: 'JUDGE0_UNAVAILABLE' });
      },
    };
    await assert.rejects(
      () => pollUntilTerminal(client, 'tok', pollOptions),
      (err) => err.code === 'JUDGE0_UNAVAILABLE',
    );
  });

  it('throws on a malformed status payload', async () => {
    const client = sequenceClient([{ token: 'tok', status: { description: 'no-id' } }]);
    await assert.rejects(
      () => pollUntilTerminal(client, 'tok', pollOptions),
      (err) => err instanceof Judge0Error && err.code === 'JUDGE0_MALFORMED_RESPONSE',
    );
  });

  it('does not busy-loop: sleeps between in-progress polls', async () => {
    const sleeps = [];
    const client = sequenceClient([
      statusPayload(JUDGE0_STATUS.IN_QUEUE),
      statusPayload(JUDGE0_STATUS.ACCEPTED),
    ]);
    await pollUntilTerminal(client, 'tok', {
      intervalMs: 25,
      maxAttempts: 5,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.deepEqual(sleeps, [25]);
  });

  it('stops polling when the abort signal fires', async () => {
    const controller = new AbortController();
    const client = sequenceClient([statusPayload(JUDGE0_STATUS.IN_QUEUE)]);
    await assert.rejects(
      () => pollUntilTerminal(client, 'tok', {
        intervalMs: 20,
        maxAttempts: 10,
        signal: controller.signal,
        sleep: async (_ms, signal) => {
          controller.abort();
          if (signal && signal.aborted) {
            const error = new Judge0Error('Judge0 polling aborted', { code: 'JUDGE0_POLLING_ABORTED' });
            throw error;
          }
        },
      }),
      (err) => err instanceof Judge0Error && err.code === 'JUDGE0_POLLING_ABORTED',
    );
  });
});
