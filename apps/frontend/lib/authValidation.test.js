const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { registrationFieldErrors, validateRegistration, MIN_PASSWORD_LENGTH } = require('./authValidation');

describe('student registration validation', () => {
  it('accepts a matching email and password pair', () => {
    assert.equal(validateRegistration({
      email: 'student@example.com',
      password: 'student-pass',
      confirmPassword: 'student-pass',
    }), null);
  });

  it('requires email and password before submit', () => {
    assert.equal(validateRegistration({
      email: '',
      password: 'student-pass',
      confirmPassword: 'student-pass',
    }), 'email is required');
    assert.equal(validateRegistration({
      email: 'student@example.com',
      password: '',
      confirmPassword: '',
    }), 'password is required');
  });

  it('rejects an invalid email format', () => {
    assert.equal(validateRegistration({
      email: 'not-an-email',
      password: 'student-pass',
      confirmPassword: 'student-pass',
    }), 'email must be a valid email address');
  });

  it('enforces the backend password length', () => {
    assert.equal(validateRegistration({
      email: 'student@example.com',
      password: 'short',
      confirmPassword: 'short',
    }), `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  });

  it('requires confirm password to match', () => {
    assert.equal(validateRegistration({
      email: 'student@example.com',
      password: 'student-pass',
      confirmPassword: 'different-pass',
    }), 'Passwords do not match.');
  });

  it('returns field messages without dropping a second invalid field', () => {
    const errors = registrationFieldErrors({
      email: 'not-an-email',
      password: 'short',
      confirmPassword: 'short',
    });
    assert.equal(errors.email, 'email must be a valid email address');
    assert.equal(errors.password, `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    assert.equal(errors.confirmPassword, undefined);
    assert.equal(validateRegistration({
      email: 'not-an-email',
      password: 'short',
      confirmPassword: 'short',
    }), errors.email);
  });
});
