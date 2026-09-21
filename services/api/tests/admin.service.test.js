const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const adminService = require('../src/admin/admin.service');
const { ROLES } = require('../src/auth/roles');

describe('Admin application service', () => {
  it('shapes a minimal admin application context from the authenticated user', () => {
    const result = adminService.getMe({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.com',
      role: ROLES.ADMIN,
      passwordHash: 'must-not-leak',
    });

    assert.deepEqual(result.user, {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'admin@example.com',
      role: ROLES.ADMIN,
    });
    assert.deepEqual(result.application, {
      name: 'CodeArena Admin',
      role: ROLES.ADMIN,
    });
    assert.equal(result.user.passwordHash, undefined);
  });

  it('returns dashboard foundation metadata without business metrics', () => {
    const result = adminService.getDashboard();
    assert.deepEqual(result, {
      application: 'admin',
      role: ROLES.ADMIN,
      status: 'ready',
    });
    assert.equal(result.users, undefined);
    assert.equal(result.contests, undefined);
    assert.equal(result.submissions, undefined);
    assert.equal(result.problems, undefined);
    assert.equal(result.students, undefined);
  });
});
