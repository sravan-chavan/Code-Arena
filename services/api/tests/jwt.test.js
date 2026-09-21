const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { signToken, verifyToken } = require('../src/auth/jwt');
const AppError = require('../src/errors/AppError');

const TEST_SECRET = 'test-only-jwt-secret-not-for-production-use';

describe('JWT utility', () => {
  before(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.JWT_EXPIRES_IN = '1h';
  });

  it('signs a minimal payload and verifies it', () => {
    const token = signToken({ sub: 'user-1', role: 'STUDENT' });
    const claims = verifyToken(token);

    assert.equal(claims.sub, 'user-1');
    assert.equal(claims.role, 'STUDENT');

    const decoded = jwt.decode(token);
    assert.equal(decoded.sub, 'user-1');
    assert.equal(decoded.role, 'STUDENT');
    assert.equal(typeof decoded.iat, 'number');
    assert.equal(typeof decoded.exp, 'number');
    assert.equal(decoded.password, undefined);
    assert.equal(decoded.password_hash, undefined);
    assert.equal(decoded.email, undefined);
  });

  it('rejects a malformed token', () => {
    assert.throws(() => verifyToken('not-a-jwt'), (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 401);
      return true;
    });
  });

  it('rejects a token signed with the wrong secret', () => {
    const other = jwt.sign(
      { sub: 'user-1', role: 'STUDENT' },
      'different-secret-not-used-by-the-api-123',
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    assert.throws(() => verifyToken(other), (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 401);
      return true;
    });
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(
      {
        sub: 'user-1',
        role: 'STUDENT',
        iat: Math.floor(Date.now() / 1000) - 120,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      TEST_SECRET,
      { algorithm: 'HS256' },
    );
    assert.throws(() => verifyToken(expired), (err) => {
      assert.ok(err instanceof AppError);
      assert.equal(err.statusCode, 401);
      return true;
    });
  });
});
