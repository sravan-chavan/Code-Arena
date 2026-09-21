const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const studentService = require('../src/student/student.service');
const { ROLES } = require('../src/auth/roles');

describe('Student application service', () => {
  it('shapes a minimal participant application context from the authenticated user', () => {
    const result = studentService.getMe({
      id: '00000000-0000-4000-8000-000000000002',
      email: 'student@example.com',
      role: ROLES.STUDENT,
      passwordHash: 'must-not-leak',
    });

    assert.deepEqual(result.user, {
      id: '00000000-0000-4000-8000-000000000002',
      email: 'student@example.com',
      role: ROLES.STUDENT,
    });
    assert.deepEqual(result.application, {
      name: 'CodeArena Participant',
      role: ROLES.STUDENT,
    });
    assert.equal(result.user.passwordHash, undefined);
  });

  it('returns dashboard foundation metadata without business metrics', () => {
    const result = studentService.getDashboard();
    assert.deepEqual(result, {
      application: 'participant',
      role: ROLES.STUDENT,
      status: 'ready',
    });
    assert.equal(result.users, undefined);
    assert.equal(result.contests, undefined);
    assert.equal(result.submissions, undefined);
    assert.equal(result.problems, undefined);
  });
});
