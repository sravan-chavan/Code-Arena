const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const seed = require('../src/migrations/005_seed_test_contest');

describe('Test contest seed migration module', () => {
  it('is an idempotent development seed named exactly Test', () => {
    assert.equal(seed.id, '005');
    assert.equal(seed.name, 'seed_test_contest');
    assert.equal(typeof seed.up, 'function');
    assert.equal(typeof seed.down, 'function');

    const source = seed.up.toString();
    assert.match(source, /findDevelopmentSeedByTitle/);
    assert.match(source, /Hello CodeArena/);
    assert.match(source, /aneradoc/);
    assert.doesNotMatch(source, /aner aedoc/);
  });
});
