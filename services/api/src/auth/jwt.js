const jwt = require('jsonwebtoken');
const { loadJwtConfig, validateJwtConfig } = require('../config/jwt');
const AppError = require('../errors/AppError');

function signingOptions(expiresIn) {
  return {
    algorithm: 'HS256',
    expiresIn,
  };
}

/**
 * @param {{ sub: string, role: string }} claims
 * @returns {string}
 */
function signToken(claims) {
  if (!claims || !claims.sub || !claims.role) {
    throw new Error('JWT payload requires sub and role');
  }

  const cfg = loadJwtConfig();
  validateJwtConfig(cfg);

  return jwt.sign(
    {
      sub: String(claims.sub),
      role: String(claims.role),
    },
    cfg.secret,
    signingOptions(cfg.expiresIn),
  );
}

/**
 * @param {string} token
 * @returns {{ sub: string, role: string }}
 */
function verifyToken(token) {
  if (typeof token !== 'string' || token.trim() === '') {
    throw new AppError('Invalid or expired token', 401, { code: 'INVALID_TOKEN' });
  }

  const cfg = loadJwtConfig();
  validateJwtConfig(cfg);

  try {
    const payload = jwt.verify(token, cfg.secret, {
      algorithms: ['HS256'],
    });

    if (!payload || typeof payload !== 'object' || !payload.sub || !payload.role) {
      throw new AppError('Invalid or expired token', 401, { code: 'INVALID_TOKEN' });
    }

    return {
      sub: String(payload.sub),
      role: String(payload.role),
    };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError('Invalid or expired token', 401, { code: 'INVALID_TOKEN' });
  }
}

module.exports = {
  signToken,
  verifyToken,
};
