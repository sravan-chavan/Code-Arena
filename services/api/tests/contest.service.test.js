const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toStudentContest, toAdminContest } = require('../src/contests/contest.service');

describe('Contest public mapping', () => {
  it('hides development-seed metadata from students', () => {
    const contest = {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Test',
      description: 'dev',
      status: 'draft',
      startTime: null,
      durationMinutes: 60,
      createdBy: 'admin-id',
      isDevelopmentSeed: true,
      createdAt: '2026-09-27T00:00:00.000Z',
      updatedAt: '2026-09-27T00:00:00.000Z',
    };
    const student = toStudentContest(contest);
    assert.equal(student.title, 'Test');
    assert.equal(student.isDevelopmentSeed, undefined);
    assert.equal(student.createdBy, undefined);
    assert.equal(student.remainingTime, null);

    const admin = toAdminContest(contest);
    assert.equal(admin.isDevelopmentSeed, true);
    assert.equal(admin.createdBy, 'admin-id');
  });

  it('computes remaining time for a running contest', () => {
    const contest = {
      id: '00000000-0000-4000-8000-000000000002',
      title: 'Live',
      description: '',
      status: 'running',
      startTime: new Date(Date.now() - 60_000).toISOString(),
      durationMinutes: 10,
      createdBy: 'admin-id',
      isDevelopmentSeed: false,
    };
    const remaining = toStudentContest(contest).remainingTime;
    assert.ok(remaining > 500);
    assert.ok(remaining <= 9 * 60);
  });
});
