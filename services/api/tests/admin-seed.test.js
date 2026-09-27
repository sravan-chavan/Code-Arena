const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const seed = require('../src/migrations/003_seed_default_admin');

describe('Default admin seed migration module', () => {
  it('is a versioned function migration that hashes instead of storing plaintext', () => {
    assert.equal(seed.id, '003');
    assert.equal(seed.name, 'seed_default_admin');
    assert.equal(typeof seed.up, 'function');
    assert.equal(typeof seed.down, 'function');

    const source = seed.up.toString();
    assert.match(source, /admin@codearena\.com/);
    assert.match(source, /hashPassword\('Admin@123'\)/);
    assert.doesNotMatch(source, /password_hash\s*=\s*'Admin@123'/);
  });
});
