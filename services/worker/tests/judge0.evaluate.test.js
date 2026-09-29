const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOutput,
  outputsMatch,
  verdictForCase,
  EXECUTION_STATUS,
} = require('../src/judge0');

describe('Correctness evaluation', () => {
  it('normalizes trailing whitespace and newlines', () => {
    assert.equal(normalizeOutput('Hello CodeArena\n'), 'Hello CodeArena');
    assert.equal(normalizeOutput('12  \n'), '12');
    assert.equal(outputsMatch('Hello CodeArena\n', 'Hello CodeArena'), true);
    assert.equal(outputsMatch('12', '13'), false);
  });

  it('keeps compilation and runtime failures from Judge0', () => {
    assert.equal(
      verdictForCase({ status: EXECUTION_STATUS.COMPILATION_ERROR, stdout: '' }, '12'),
      EXECUTION_STATUS.COMPILATION_ERROR,
    );
    assert.equal(
      verdictForCase({ status: EXECUTION_STATUS.RUNTIME_ERROR, stdout: '' }, '12'),
      EXECUTION_STATUS.RUNTIME_ERROR,
    );
    assert.equal(
      verdictForCase({ status: EXECUTION_STATUS.TIME_LIMIT_EXCEEDED, stdout: '' }, '12'),
      EXECUTION_STATUS.TIME_LIMIT_EXCEEDED,
    );
  });

  it('treats matching stdout as ACCEPTED even if Judge0 only reported a successful run', () => {
    assert.equal(
      verdictForCase({ status: EXECUTION_STATUS.ACCEPTED, stdout: '12\n' }, '12'),
      EXECUTION_STATUS.ACCEPTED,
    );
  });

  it('treats mismatched stdout as WRONG_ANSWER', () => {
    assert.equal(
      verdictForCase({ status: EXECUTION_STATUS.ACCEPTED, stdout: '99' }, '12'),
      EXECUTION_STATUS.WRONG_ANSWER,
    );
  });
});
