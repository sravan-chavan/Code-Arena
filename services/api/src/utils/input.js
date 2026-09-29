const { UUID_PATTERN } = require('@codearena/messaging');
const AppError = require('../errors/AppError');

function assertUuid(value, field) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new AppError(`${field} must be a UUID`, 400, {
      code: 'VALIDATION_ERROR',
      errors: [{ field, location: 'params', message: `${field} must be a UUID` }],
    });
  }
  return value;
}

function trimRequired(value, field, maxLength = 200) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AppError(`${field} is required`, 400, { code: 'VALIDATION_ERROR' });
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new AppError(`${field} must be at most ${maxLength} characters`, 400, {
      code: 'VALIDATION_ERROR',
    });
  }
  return trimmed;
}

module.exports = {
  assertUuid,
  trimRequired,
};
