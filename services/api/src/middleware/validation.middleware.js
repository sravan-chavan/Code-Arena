const AppError = require('../errors/AppError');

/**
 * @typedef {'string' | 'number' | 'boolean' | 'object' | 'array'} FieldType
 *
 * @typedef {object} FieldRule
 * @property {FieldType} type
 * @property {boolean} [required]
 * @property {number} [minLength]
 * @property {number} [maxLength]
 * @property {number} [min]
 * @property {number} [max]
 */

/**
 * @param {unknown} value
 * @param {FieldType} type
 */
function matchesType(value, type) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    default:
      return false;
  }
}

/**
 * @param {Record<string, unknown>} source
 * @param {Record<string, FieldRule>} schema
 * @param {'body' | 'params' | 'query'} location
 */
function validateObject(source, schema, location) {
  /** @type {{ field: string, location: string, message: string }[]} */
  const errors = [];

  for (const [field, rule] of Object.entries(schema)) {
    const value = source?.[field];
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '');

    if (missing) {
      if (rule.required) {
        errors.push({
          field,
          location,
          message: `${field} is required`,
        });
      }
      continue;
    }

    if (!matchesType(value, rule.type)) {
      errors.push({
        field,
        location,
        message: `${field} must be of type ${rule.type}`,
      });
      continue;
    }

    if (rule.type === 'string') {
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        errors.push({
          field,
          location,
          message: `${field} must be at least ${rule.minLength} characters`,
        });
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        errors.push({
          field,
          location,
          message: `${field} must be at most ${rule.maxLength} characters`,
        });
      }
    }

    if (rule.type === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        errors.push({
          field,
          location,
          message: `${field} must be >= ${rule.min}`,
        });
      }
      if (rule.max !== undefined && value > rule.max) {
        errors.push({
          field,
          location,
          message: `${field} must be <= ${rule.max}`,
        });
      }
    }
  }

  return errors;
}

/**
 * Reusable request validation middleware factory.
 * Supports body, params, and query schemas for future modules.
 *
 * @param {{ body?: Record<string, FieldRule>, params?: Record<string, FieldRule>, query?: Record<string, FieldRule> }} schemas
 */
function validate(schemas = {}) {
  return (req, _res, next) => {
    const errors = [
      ...(schemas.body
        ? validateObject(req.body || {}, schemas.body, 'body')
        : []),
      ...(schemas.params
        ? validateObject(req.params || {}, schemas.params, 'params')
        : []),
      ...(schemas.query
        ? validateObject(req.query || {}, schemas.query, 'query')
        : []),
    ];

    if (errors.length > 0) {
      return next(
        new AppError('Validation failed', 400, {
          code: 'VALIDATION_ERROR',
          errors,
        }),
      );
    }

    return next();
  };
}

module.exports = {
  validate,
};
