const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/auth/password');

describe('Password hashing', () => {
  it('hashes a password and never returns the plaintext', async () => {
    const plain = 'correct-horse-battery';
    const hash = await hashPassword(plain);

    assert.equal(typeof hash, 'string');
    assert.notEqual(hash, plain);
    assert.match(hash, /^\$2[aby]\$/);
    assert.equal(hash.includes(plain), false);
  });

  it('verifies the correct password and rejects an incorrect one', async () => {
    const plain = 'correct-horse-battery';
    const hash = await hashPassword(plain);

    assert.equal(await verifyPassword(plain, hash), true);
    assert.equal(await verifyPassword('wrong-password-value', hash), false);
  });

  it('rejects empty or non-string secrets without throwing from verify', async () => {
    assert.equal(await verifyPassword('anything', ''), false);
    assert.equal(await verifyPassword('anything', null), false);
    await assert.rejects(() => hashPassword(''), /required/i);
  });
});
