const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { requirePostgres, uniqueEmail } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const { runMigrations } = require('../../src/db/migrate');
const userRepository = require('../../src/repositories/user.repository');
const { hashPassword } = require('../../src/auth/password');
const { ROLES } = require('../../src/auth/roles');

describe('user repository', () => {
  const emails = [];

  before(async () => {
    await requirePostgres();
    await runMigrations();
  });

  after(async () => {
    for (const email of emails) {
      await query('DELETE FROM users WHERE email = $1', [email]).catch(() => {});
    }
    await closePool();
  });

  it('creates a user and finds them by id and normalized email', async () => {
    const email = uniqueEmail('repo');
    emails.push(email);
    const passwordHash = await hashPassword('repo-password-1');

    const created = await userRepository.create({
      email,
      passwordHash,
      role: ROLES.STUDENT,
    });

    assert.ok(created.id);
    assert.equal(created.email, email);
    assert.equal(created.role, ROLES.STUDENT);
    assert.equal(created.passwordHash, undefined);
    assert.equal(created.password_hash, undefined);

    const byId = await userRepository.findById(created.id);
    assert.equal(byId.email, email);

    const byEmail = await userRepository.findByEmail(email);
    assert.equal(byEmail.id, created.id);

    const withHash = await userRepository.findByEmailWithPasswordHash(email);
    assert.equal(withHash.passwordHash, passwordHash);
    assert.notEqual(withHash.passwordHash, 'repo-password-1');
  });

  it('maps duplicate emails to EMAIL_TAKEN without exposing SQL', async () => {
    const email = uniqueEmail('dup');
    emails.push(email);
    const passwordHash = await hashPassword('repo-password-1');
    await userRepository.create({ email, passwordHash });

    await assert.rejects(
      () => userRepository.create({ email, passwordHash }),
      (err) => {
        assert.equal(err.code, 'EMAIL_TAKEN');
        assert.doesNotMatch(String(err.message), /duplicate key/i);
        return true;
      },
    );
  });

  it('can create an ADMIN user through the repository (not the public API)', async () => {
    const email = uniqueEmail('admin');
    emails.push(email);
    const created = await userRepository.create({
      email,
      passwordHash: await hashPassword('admin-password-1'),
      role: ROLES.ADMIN,
    });
    assert.equal(created.role, ROLES.ADMIN);
  });
});
