const AppError = require('../errors/AppError');
const { isRole } = require('../auth/roles');

/**
 * Authorization after authentication.
 * Usage: authenticate, requireRole('ADMIN'), controller
 *
 * @param {...string} allowedRoles
 */
function requireRole(...allowedRoles) {
  const allowed = allowedRoles.filter(isRole);
  if (allowed.length === 0) {
    throw new Error('requireRole requires at least one valid role');
  }

  return (req, _res, next) => {
    if (!req.user) {
      return next(
        new AppError('Authentication required', 401, {
          code: 'UNAUTHENTICATED',
        }),
      );
    }

    if (!allowed.includes(req.user.role)) {
      return next(
        new AppError('Forbidden', 403, {
          code: 'FORBIDDEN',
        }),
      );
    }

    return next();
  };
}

module.exports = requireRole;
