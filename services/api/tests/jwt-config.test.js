const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  loadJwtConfig,
  validateJwtConfig,
  PLACEHOLDER_SECRET,
} = require('../src/config/jwt');

describe('JWT configuration', () => {
  it('defaults expiration to 1h when JWT_EXPIRES_IN is absent', () => {
    const cfg = loadJwtConfig({
      JWT_SECRET: 'a'.repeat(32),
    });
    assert.equal(cfg.expiresIn, '1h');
    assert.equal(cfg.secretSpecified, true);
  });

  it('fails clearly when the secret is missing', () => {
    const cfg = loadJwtConfig({});
    assert.throws(() => validateJwtConfig(cfg), /JWT_SECRET/);
  });

  it('fails clearly when the secret is too short', () => {
    const cfg = loadJwtConfig({ JWT_SECRET: 'short' });
    assert.throws(() => validateJwtConfig(cfg), /at least 32/);
  });

  it('rejects the example placeholder in production', () => {
    const cfg = loadJwtConfig({ JWT_SECRET: PLACEHOLDER_SECRET });
    assert.throws(
      () => validateJwtConfig(cfg, { envName: 'production' }),
      /placeholder/i,
    );
  });

  it('does not include the secret in validation error messages', () => {
    const secret = 'super-secret-value-that-must-not-leak-123';
    const cfg = loadJwtConfig({ JWT_SECRET: secret.slice(0, 8) });
    try {
      validateJwtConfig(cfg);
      assert.fail('expected validation to throw');
    } catch (err) {
      assert.doesNotMatch(String(err.message), /super-secret-value/);
    }
  });
});
