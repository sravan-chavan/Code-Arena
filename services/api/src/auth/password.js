const bcrypt = require('bcrypt');
const config = require('../config/environment');

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;

function costFactor() {
  return config.isTest ? 4 : 12;
}

function assertPasswordPresent(plain) {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('Password is required');
  }
}

async function hashPassword(plain) {
  assertPasswordPresent(plain);
  return bcrypt.hash(plain, costFactor());
}

async function verifyPassword(plain, passwordHash) {
  if (typeof plain !== 'string' || typeof passwordHash !== 'string' || passwordHash === '') {
    return false;
  }
  return bcrypt.compare(plain, passwordHash);
}

module.exports = {
  hashPassword,
  verifyPassword,
  costFactor,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
};
