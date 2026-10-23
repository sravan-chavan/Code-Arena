const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PAGE_SIZE,
  parseUserListQuery,
  registerStudent,
} = require('../src/admin/admin.user.service');

describe('Admin user list query', () => {
  it('defaults to the first page and a bounded page size', () => {
    const parsed = parseUserListQuery({});
    assert.deepEqual(parsed, {
      search: '',
      role: null,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });

  it('accepts student and admin role filters in any case', () => {
    assert.equal(parseUserListQuery({ role: 'student' }).role, 'STUDENT');
    assert.equal(parseUserListQuery({ role: 'ADMIN' }).role, 'ADMIN');
    assert.equal(parseUserListQuery({ role: 'all' }).role, null);
    assert.equal(parseUserListQuery({ role: '' }).role, null);
  });

  it('trims search text and keeps it bounded', () => {
    const parsed = parseUserListQuery({ search: '  Lab.User@Example.com  ' });
    assert.equal(parsed.search, 'Lab.User@Example.com');
    const long = parseUserListQuery({ search: 'a'.repeat(300) });
    assert.equal(long.search.length, 254);
  });

  it('paginates with an offset and rejects unbounded page sizes', () => {
    const parsed = parseUserListQuery({ page: '3', pageSize: '10' });
    assert.equal(parsed.page, 3);
    assert.equal(parsed.pageSize, 10);
    assert.equal(parsed.offset, 20);

    assert.throws(
      () => parseUserListQuery({ pageSize: '500' }),
      (err) => err.statusCode === 400 && err.errors[0].field === 'pageSize',
    );
    assert.throws(
      () => parseUserListQuery({ page: '0' }),
      (err) => err.statusCode === 400 && err.errors[0].field === 'page',
    );
  });

  it('rejects roles outside the application role model', () => {
    assert.throws(
      () => parseUserListQuery({ role: 'OWNER' }),
      (err) => err.statusCode === 400 && err.code === 'VALIDATION_ERROR',
    );
    assert.throws(
      () => parseUserListQuery({ role: ['ADMIN'] }),
      (err) => err.statusCode === 400,
    );
  });
});

describe('Admin student registration policy', () => {
  it('rejects administrator and unknown roles before creating an account', async () => {
    for (const role of ['ADMIN', 'admin', 'OWNER']) {
      await assert.rejects(
        () => registerStudent({
          email: 'should-not-exist@example.com',
          password: 'valid-pass',
          role,
        }),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, 'VALIDATION_ERROR');
          assert.equal(err.errors[0].field, 'role');
          assert.equal(err.errors[0].message, 'Only student accounts can be registered');
          return true;
        },
      );
    }
  });
});
