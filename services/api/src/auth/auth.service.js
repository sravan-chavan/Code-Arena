const AppError = require('../errors/AppError');
const userRepository = require('../repositories/user.repository');
const { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } = require('./password');
const { signToken } = require('./jwt');
const { normalizeEmail, isValidEmail } = require('./email');
const { ROLES } = require('./roles');

function toSafeUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

function invalidCredentials() {
  return new AppError('Invalid email or password', 401, {
    code: 'INVALID_CREDENTIALS',
  });
}

function validationError(field, message) {
  return new AppError('Validation failed', 400, {
    code: 'VALIDATION_ERROR',
    errors: [{ field, location: 'body', message }],
  });
}

function assertPasswordPolicy(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw validationError('password', 'password is required');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw validationError(
      'password',
      `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw validationError(
      'password',
      `password must be at most ${MAX_PASSWORD_LENGTH} characters`,
    );
  }
}

async function register({ email, password }) {
  if (!isValidEmail(email)) {
    throw validationError('email', 'email must be a valid email address');
  }
  assertPasswordPolicy(password);

  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await hashPassword(password);

  try {
    const user = await userRepository.create({
      email: normalizedEmail,
      passwordHash,
      role: ROLES.STUDENT,
    });
    return { user: toSafeUser(user) };
  } catch (err) {
    if (err && err.code === 'EMAIL_TAKEN') {
      throw new AppError('Email already registered', 409, {
        code: 'EMAIL_TAKEN',
      });
    }
    throw err;
  }
}

async function login({ email, password }) {
  if (!isValidEmail(email)) {
    throw invalidCredentials();
  }
  if (typeof password !== 'string' || password.length === 0) {
    throw invalidCredentials();
  }

  const normalizedEmail = normalizeEmail(email);
  const user = await userRepository.findByEmailWithPasswordHash(normalizedEmail);
  if (!user) {
    throw invalidCredentials();
  }

  const matches = await verifyPassword(password, user.passwordHash);
  if (!matches) {
    throw invalidCredentials();
  }

  const token = signToken({ sub: user.id, role: user.role });
  return {
    token,
    user: toSafeUser(user),
  };
}

async function getMe(userId) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('Authentication required', 401, {
      code: 'UNAUTHENTICATED',
    });
  }
  return { user: toSafeUser(user) };
}

module.exports = {
  register,
  login,
  getMe,
  toSafeUser,
};
