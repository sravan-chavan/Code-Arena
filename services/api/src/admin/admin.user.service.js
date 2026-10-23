const AppError = require('../errors/AppError');
const authService = require('../auth/auth.service');
const userRepository = require('../repositories/user.repository');
const { ROLES, isRole } = require('../auth/roles');

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 254;
const MAX_PAGE = 100000;

/**
 * Total registered users is COUNT(*) FROM users.
 * There is no account-status column, so enabled, disabled, and "currently logged in"
 * are not distinct counts. The list payload and GET /admin/users/count share this count.
 */

function validationError(field, message, location = 'query') {
  return new AppError(message, 400, {
    code: 'VALIDATION_ERROR',
    errors: [{ field, location, message }],
  });
}

function parseBoundedInt(value, field, min, max, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw validationError(field, `${field} must be an integer from ${min} to ${max}`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw validationError(field, `${field} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function parseUserListQuery(query) {
  const source = query || {};

  let search = '';
  if (source.search !== undefined && source.search !== '') {
    if (typeof source.search !== 'string') {
      throw validationError('search', 'search must be a string');
    }
    search = source.search.trim().slice(0, MAX_SEARCH_LENGTH);
  }

  let role = null;
  if (source.role !== undefined && source.role !== '') {
    if (typeof source.role !== 'string') {
      throw validationError('role', 'role is invalid');
    }
    const raw = source.role.trim();
    if (raw !== '' && raw.toLowerCase() !== 'all') {
      const normalized = raw.toUpperCase();
      if (!isRole(normalized)) {
        throw validationError('role', 'role is invalid');
      }
      role = normalized;
    }
  }

  const page = parseBoundedInt(source.page, 'page', 1, MAX_PAGE, 1);
  const pageSize = parseBoundedInt(
    source.pageSize,
    'pageSize',
    1,
    MAX_PAGE_SIZE,
    DEFAULT_PAGE_SIZE,
  );

  return {
    search,
    role,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

/**
 * Administrator registration may only create students.
 * Omitting role, or sending STUDENT, is allowed. ADMIN and any other role are rejected
 * before the shared registration service runs. Public registration is unchanged and
 * continues to ignore a client-supplied role.
 */
function assertStudentRegistrationRole(body) {
  if (!body || body.role === undefined || body.role === null || body.role === '') {
    return;
  }
  if (typeof body.role !== 'string') {
    throw validationError('role', 'Only student accounts can be registered', 'body');
  }
  const normalized = body.role.trim().toUpperCase();
  if (normalized === '' || normalized === ROLES.STUDENT) {
    return;
  }
  throw validationError('role', 'Only student accounts can be registered', 'body');
}

async function listUsers(query) {
  const parsed = parseUserListQuery(query);
  const filters = { search: parsed.search, role: parsed.role };
  const hasFilter = Boolean(parsed.search || parsed.role);
  const [users, totalUsers, filteredTotal] = await Promise.all([
    userRepository.list({
      search: parsed.search,
      role: parsed.role,
      limit: parsed.pageSize,
      offset: parsed.offset,
    }),
    userRepository.count({}),
    hasFilter ? userRepository.count(filters) : Promise.resolve(null),
  ]);
  const total = hasFilter ? filteredTotal : totalUsers;

  return {
    users,
    total,
    totalUsers,
    page: parsed.page,
    pageSize: parsed.pageSize,
    pageCount: Math.max(1, Math.ceil(total / parsed.pageSize)),
  };
}

async function countUsers() {
  return {
    totalUsers: await userRepository.count({}),
  };
}

async function registerStudent(body) {
  assertStudentRegistrationRole(body);
  return authService.register({
    email: body?.email,
    password: body?.password,
  });
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  parseUserListQuery,
  listUsers,
  countUsers,
  registerStudent,
};
