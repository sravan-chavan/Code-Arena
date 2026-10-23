const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assignmentOf } = require('../src/contests/question.service');

describe('Question assignment classification', () => {
  it('classifies contest, practice, and unassigned library questions', () => {
    assert.equal(
      assignmentOf({
        contests: [{ id: '00000000-0000-4000-8000-000000000001', title: 'A' }],
        isPractice: false,
      }),
      'contest',
    );
    assert.equal(
      assignmentOf({
        contests: [
          { id: '00000000-0000-4000-8000-000000000001', title: 'A' },
          { id: '00000000-0000-4000-8000-000000000002', title: 'B' },
        ],
        isPractice: false,
      }),
      'contest',
    );
    assert.equal(assignmentOf({ contestId: null, isPractice: true }), 'practice');
    assert.equal(assignmentOf({ contests: [], isPractice: false }), 'unassigned');
    assert.equal(assignmentOf({ isPractice: false }), 'unassigned');
    assert.equal(
      assignmentOf({
        isPractice: true,
        contests: [{ id: '00000000-0000-4000-8000-000000000003', title: 'C' }],
      }),
      'both',
    );
    assert.equal(
      assignmentOf({
        archived: true,
        isPractice: true,
        contests: [{ id: '00000000-0000-4000-8000-000000000003', title: 'C' }],
      }),
      'archived',
    );
  });
});
