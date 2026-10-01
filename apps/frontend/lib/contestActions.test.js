const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { canResumeContest } = require('./contestActions');

describe('admin resume visibility', () => {
  it('shows resume only when the server allows it on an ended contest', () => {
    assert.equal(canResumeContest({ status: 'ended', allowedActions: ['resume'] }), true);
    assert.equal(canResumeContest({ status: 'running', allowedActions: ['update', 'end'] }), false);
    assert.equal(canResumeContest({ status: 'running', allowedActions: ['resume'] }), false);
    assert.equal(canResumeContest({ status: 'cancelled', allowedActions: [] }), false);
    assert.equal(canResumeContest(null), false);
  });
});
