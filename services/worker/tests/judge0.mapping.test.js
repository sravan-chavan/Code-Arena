const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  JUDGE0_STATUS,
  JUDGE0_STATUS_NAME,
  EXECUTION_STATUS,
  mapJudge0Status,
  mapJudge0Submission,
  isTerminalJudge0Status,
  isInProgressJudge0Status,
} = require('../src/judge0');

describe('Judge0 status mapping', () => {
  const cases = [
    [JUDGE0_STATUS.IN_QUEUE, EXECUTION_STATUS.QUEUED, 'In Queue'],
    [JUDGE0_STATUS.PROCESSING, EXECUTION_STATUS.RUNNING, 'Processing'],
    [JUDGE0_STATUS.ACCEPTED, EXECUTION_STATUS.ACCEPTED, 'Accepted'],
    [JUDGE0_STATUS.WRONG_ANSWER, EXECUTION_STATUS.WRONG_ANSWER, 'Wrong Answer'],
    [JUDGE0_STATUS.TIME_LIMIT_EXCEEDED, EXECUTION_STATUS.TIME_LIMIT_EXCEEDED, 'Time Limit Exceeded'],
    [JUDGE0_STATUS.COMPILATION_ERROR, EXECUTION_STATUS.COMPILATION_ERROR, 'Compilation Error'],
    [JUDGE0_STATUS.RUNTIME_ERROR_SIGSEGV, EXECUTION_STATUS.RUNTIME_ERROR, 'Runtime Error (SIGSEGV)'],
    [JUDGE0_STATUS.RUNTIME_ERROR_SIGXFSZ, EXECUTION_STATUS.RUNTIME_ERROR, 'Runtime Error (SIGXFSZ)'],
    [JUDGE0_STATUS.RUNTIME_ERROR_SIGFPE, EXECUTION_STATUS.RUNTIME_ERROR, 'Runtime Error (SIGFPE)'],
    [JUDGE0_STATUS.RUNTIME_ERROR_SIGABRT, EXECUTION_STATUS.RUNTIME_ERROR, 'Runtime Error (SIGABRT)'],
    [JUDGE0_STATUS.RUNTIME_ERROR_NZEC, EXECUTION_STATUS.RUNTIME_ERROR, 'Runtime Error (NZEC)'],
    [JUDGE0_STATUS.RUNTIME_ERROR_OTHER, EXECUTION_STATUS.RUNTIME_ERROR, 'Runtime Error (Other)'],
    [JUDGE0_STATUS.INTERNAL_ERROR, EXECUTION_STATUS.INTERNAL_ERROR, 'Internal Error'],
    [JUDGE0_STATUS.EXEC_FORMAT_ERROR, EXECUTION_STATUS.RUNTIME_ERROR, 'Exec Format Error'],
  ];

  for (const [judge0Id, expected, name] of cases) {
    it(`maps Judge0 ${judge0Id} (${name}) to ${expected}`, () => {
      assert.equal(mapJudge0Status(judge0Id), expected);
      assert.equal(JUDGE0_STATUS_NAME[judge0Id], name);
    });
  }

  it('maps unknown Judge0 status ids to INTERNAL_ERROR', () => {
    assert.equal(mapJudge0Status(99), EXECUTION_STATUS.INTERNAL_ERROR);
    assert.equal(mapJudge0Status(null), EXECUTION_STATUS.INTERNAL_ERROR);
  });

  it('treats In Queue and Processing as in-progress, not terminal', () => {
    assert.equal(isInProgressJudge0Status(JUDGE0_STATUS.IN_QUEUE), true);
    assert.equal(isInProgressJudge0Status(JUDGE0_STATUS.PROCESSING), true);
    assert.equal(isTerminalJudge0Status(JUDGE0_STATUS.IN_QUEUE), false);
    assert.equal(isTerminalJudge0Status(JUDGE0_STATUS.PROCESSING), false);
  });

  it('treats every defined status after Processing as terminal', () => {
    for (const [judge0Id] of cases) {
      if (judge0Id === JUDGE0_STATUS.IN_QUEUE || judge0Id === JUDGE0_STATUS.PROCESSING) {
        continue;
      }
      assert.equal(isTerminalJudge0Status(judge0Id), true);
    }
  });

  it('treats unknown positive ids as terminal so polling cannot loop', () => {
    assert.equal(isTerminalJudge0Status(15), true);
    assert.equal(isTerminalJudge0Status(0), false);
  });

  it('maps a Judge0 submission payload into a CodeArena result', () => {
    const mapped = mapJudge0Submission({
      token: 'sub-token',
      stdout: 'Hello CodeArena\n',
      stderr: null,
      compile_output: null,
      message: null,
      exit_code: 0,
      exit_signal: null,
      time: '0.012',
      memory: 2048,
      status: { id: JUDGE0_STATUS.ACCEPTED, description: 'Accepted' },
    });
    assert.equal(mapped.status, EXECUTION_STATUS.ACCEPTED);
    assert.equal(mapped.token, 'sub-token');
    assert.equal(mapped.stdout, 'Hello CodeArena\n');
    assert.equal(mapped.exitCode, 0);
    assert.equal(mapped.time, '0.012');
    assert.equal(mapped.memory, 2048);
    assert.equal(mapped.judge0StatusId, 3);
  });
});
