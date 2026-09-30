const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const clock = require('../src/contests/clock');
const { toStudentContest, toAdminContest } = require('../src/contests/contest.service');

describe('Contest public mapping', () => {
  afterEach(() => {
    clock.resetNow();
  });

  it('hides development-seed metadata from students', () => {
    const contest = {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Test',
      description: 'dev',
      status: 'draft',
      startTime: null,
      endTime: null,
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
    assert.equal(student.storedStatus, undefined);
    assert.equal(student.remainingTime, null);
    assert.equal(student.status, 'draft');

    const admin = toAdminContest(contest);
    assert.equal(admin.isDevelopmentSeed, true);
    assert.equal(admin.createdBy, 'admin-id');
    assert.equal(admin.storedStatus, 'draft');
    assert.deepEqual(admin.allowedActions, ['update', 'schedule', 'cancel']);
    assert.deepEqual(admin.editableFields, ['title', 'description', 'startTime', 'endTime', 'durationMinutes']);
  });

  it('computes remaining time for a running contest from the server clock', () => {
    clock.setNow('2026-09-30T12:00:00.000Z');
    const contest = {
      id: '00000000-0000-4000-8000-000000000002',
      title: 'Live',
      description: '',
      status: 'scheduled',
      startTime: '2026-09-30T11:59:00.000Z',
      endTime: '2026-09-30T12:09:00.000Z',
      durationMinutes: 10,
      createdBy: 'admin-id',
      isDevelopmentSeed: false,
    };
    const student = toStudentContest(contest);
    assert.equal(student.status, 'running');
    assert.equal(student.remainingTime, 9 * 60);
    assert.equal(student.serverTime, '2026-09-30T12:00:00.000Z');
    assert.equal(student.canRegister, true);
    assert.equal(student.canEnter, false);
  });
});
