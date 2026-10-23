const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  ADMIN_USERS_PATH,
  adminNav,
  studentNav,
  exposesAdminUserManagement,
  buildAdminUserQuery,
  presentAdminUser,
  userListViewState,
  userTotalLabel,
  assertUserListPayload,
  assertUserCountPayload,
  registrationFailure,
} = require('./usersAdmin');

describe('admin user management helpers', () => {
  it('sends search, role, and a bounded page to the backend', () => {
    const query = buildAdminUserQuery({
      search: '  ada@example.com ',
      role: 'STUDENT',
      page: 2,
      pageSize: 25,
    });
    const params = new URLSearchParams(query);
    assert.equal(params.get('search'), 'ada@example.com');
    assert.equal(params.get('role'), 'STUDENT');
    assert.equal(params.get('page'), '2');
    assert.equal(params.get('pageSize'), '25');
    assert.equal(buildAdminUserQuery({ role: 'all' }).includes('role='), false);
  });

  it('shows stored fields and leaves unsupported profile fields blank', () => {
    const row = presentAdminUser({
      id: 'user-1',
      email: 'ada@example.com',
      role: 'STUDENT',
      createdAt: '2026-10-23T00:00:00.000Z',
      password: 'secret',
      passwordHash: '$2b$secret',
      password_hash: '$2b$secret',
    });
    assert.equal(row.displayName, 'ada@example.com');
    assert.equal(row.email, 'ada@example.com');
    assert.equal(row.role, 'STUDENT');
    assert.equal(row.username, '—');
    assert.equal(row.rollNo, '—');
    assert.equal(row.password, undefined);
    assert.equal(row.passwordHash, undefined);
    assert.equal(presentAdminUser({}).email, '—');
    assert.equal(presentAdminUser({ email: 'admin@example.com', role: 'ADMIN' }).isAdmin, true);
  });

  it('distinguishes loading, error, empty, and filtered results', () => {
    assert.equal(userListViewState({ loaded: false, error: '', users: [], totalUsers: 0, filtered: false }), 'loading');
    assert.equal(userListViewState({ loaded: false, error: 'Database unavailable', users: [], totalUsers: 0, filtered: false }), 'error');
    assert.equal(userListViewState({ loaded: true, error: '', users: [], totalUsers: 0, filtered: false }), 'empty');
    assert.equal(userListViewState({ loaded: true, error: '', users: [], totalUsers: 4, filtered: true }), 'no-matches');
    assert.equal(userListViewState({
      loaded: true,
      error: '',
      users: [{ id: '1' }],
      totalUsers: 1,
      filtered: false,
    }), 'ready');
  });

  it('shows the database count and never substitutes a placeholder number', () => {
    assert.equal(userTotalLabel({ loaded: false, error: '', totalUsers: null }), '…');
    assert.equal(userTotalLabel({ loaded: true, error: 'Count failed', totalUsers: null }), '—');
    assert.equal(userTotalLabel({ loaded: true, error: '', totalUsers: 0 }), '0');
    assert.equal(userTotalLabel({ loaded: true, error: '', totalUsers: 12 }), '12');
    assert.equal(userTotalLabel({ loaded: true, error: 'stale', totalUsers: 12 }), '12');
  });

  it('rejects incomplete list and count payloads', () => {
    assert.equal(assertUserListPayload({ users: [], total: 0, totalUsers: 0 }), null);
    assert.equal(assertUserListPayload({ users: [{ email: 'a@example.com' }] }), 'User list response was incomplete.');
    assert.equal(assertUserCountPayload({ totalUsers: 3 }), null);
    assert.equal(assertUserCountPayload({ totalUsers: '3' }), 'User count response was incomplete.');
  });

  it('maps duplicate and field errors from the registration API', () => {
    const duplicate = registrationFailure({
      message: 'Email already registered',
      payload: { message: 'Email already registered', code: 'EMAIL_TAKEN' },
    });
    assert.equal(duplicate.fieldErrors.email, 'Email already registered');

    const invalid = registrationFailure({
      message: 'Validation failed',
      payload: {
        message: 'Validation failed',
        errors: [{ field: 'password', message: 'password must be at least 8 characters' }],
      },
    });
    assert.equal(invalid.fieldErrors.password, 'password must be at least 8 characters');
    assert.equal(registrationFailure(new Error('Unable to reach the server.')).message, 'Unable to reach the server.');
  });

  it('keeps user management on the admin navigation only', () => {
    assert.equal(ADMIN_USERS_PATH, '/admin/users');
    assert.equal(adminNav.find((link) => link.name === 'Users').href, ADMIN_USERS_PATH);
    assert.equal(exposesAdminUserManagement(adminNav), true);
    assert.equal(exposesAdminUserManagement(studentNav), false);
    assert.equal(studentNav.some((link) => String(link.href).includes('users')), false);
  });
});
