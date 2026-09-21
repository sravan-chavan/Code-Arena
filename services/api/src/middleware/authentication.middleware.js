const AppError = require('../errors/AppError');
const { verifyToken } = require('../auth/jwt');
const userRepository = require('../repositories/user.repository');
const asyncHandler = require('../utils/async-handler');

function parseBearerToken(header) {
  if (typeof header !== 'string') {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function unauthenticated() {
  return new AppError('Authentication required', 401, {
    code: 'UNAUTHENTICATED',
  });
}

/**
 * Verifies the Bearer JWT and loads the current user from PostgreSQL.
 * Attaches { id, email, role } to req.user. Never copies password_hash.
 */
const authenticate = asyncHandler(async (req, _res, next) => {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) {
    throw unauthenticated();
  }

  const claims = verifyToken(token);
  const user = await userRepository.findById(claims.sub);
  if (!user) {
    throw unauthenticated();
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
  };
  return next();
});

module.exports = authenticate;
