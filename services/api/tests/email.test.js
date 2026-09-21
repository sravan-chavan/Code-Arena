const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, isValidEmail } = require('../src/auth/email');

describe('Email normalization', () => {
  it('trims whitespace and lowercases', () => {
    assert.equal(normalizeEmail('  Student@Example.COM  '), 'student@example.com');
  });

  it('accepts a typical address', () => {
    assert.equal(isValidEmail('student@example.com'), true);
  });

  it('rejects missing at-sign and empty values', () => {
    assert.equal(isValidEmail('not-an-email'), false);
    assert.equal(isValidEmail(''), false);
    assert.equal(isValidEmail('   '), false);
    assert.equal(isValidEmail(null), false);
  });
});
