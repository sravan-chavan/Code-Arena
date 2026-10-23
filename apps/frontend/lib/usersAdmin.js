const { registrationFieldErrors } = require('./authValidation');
const {
  ADMIN_USERS_PATH,
  adminNav,
  studentNav,
  exposesAdminUserManagement,
} = require('./navigation');

const ADMIN_USER_PAGE_SIZE = 25;

function buildAdminUserQuery({ search = '', role = 'all', page = 1, pageSize = ADMIN_USER_PAGE_SIZE } = {}) {
  const params = new URLSearchParams();
  const term = typeof search === 'string' ? search.trim() : '';
  if (term) params.set('search', term);
  if (role && role !== 'all') params.set('role', role);
  params.set('page', String(page));
  params.set('pageSize', String(pageSize));
  return params.toString();
}

function presentAdminUser(user) {
  const source = user && typeof user === 'object' ? user : {};
  const email = typeof source.email === 'string' && source.email.trim() ? source.email.trim() : '';
  const role = source.role === 'ADMIN' || source.role === 'STUDENT' ? source.role : '';
  return {
    id: typeof source.id === 'string' && source.id ? source.id : (email || 'unknown-user'),
    email: email || '—',
    role,
    isAdmin: role === 'ADMIN',
    initial: (email || '?').charAt(0).toUpperCase(),
    displayName: email || '—',
    username: '—',
    rollNo: '—',
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : null,
  };
}

function userListViewState({ loaded, error, users, totalUsers, filtered }) {
  if (!loaded && error) return 'error';
  if (!loaded) return 'loading';
  if (!Array.isArray(users) || users.length === 0) {
    return filtered || totalUsers > 0 ? 'no-matches' : 'empty';
  }
  return 'ready';
}

function userTotalLabel({ loaded, error, totalUsers }) {
  if (typeof totalUsers === 'number' && Number.isInteger(totalUsers) && totalUsers >= 0) {
    return String(totalUsers);
  }
  if (!loaded && !error) return '…';
  return '—';
}

function assertUserListPayload(data) {
  if (
    !data
    || !Array.isArray(data.users)
    || typeof data.totalUsers !== 'number'
    || !Number.isInteger(data.totalUsers)
    || data.totalUsers < 0
    || typeof data.total !== 'number'
    || !Number.isInteger(data.total)
    || data.total < 0
  ) {
    return 'User list response was incomplete.';
  }
  return null;
}

function assertUserCountPayload(data) {
  if (
    !data
    || typeof data.totalUsers !== 'number'
    || !Number.isInteger(data.totalUsers)
    || data.totalUsers < 0
  ) {
    return 'User count response was incomplete.';
  }
  return null;
}

function registrationFailure(error) {
  const payload = error && typeof error === 'object' && error.payload && typeof error.payload === 'object'
    ? error.payload
    : {};
  const fieldErrors = {};
  if (Array.isArray(payload.errors)) {
    for (const item of payload.errors) {
      if (!item || typeof item.field !== 'string' || typeof item.message !== 'string') continue;
      if (!fieldErrors[item.field]) fieldErrors[item.field] = item.message;
    }
  }
  const message = typeof payload.message === 'string' && payload.message
    ? payload.message
    : (error && typeof error.message === 'string' && error.message
      ? error.message
      : 'Registration failed. Please try again.');
  if (payload.code === 'EMAIL_TAKEN' && !fieldErrors.email) {
    fieldErrors.email = message;
  }
  return { message, fieldErrors };
}

module.exports = {
  ADMIN_USERS_PATH,
  ADMIN_USER_PAGE_SIZE,
  adminNav,
  studentNav,
  exposesAdminUserManagement,
  buildAdminUserQuery,
  presentAdminUser,
  userListViewState,
  userTotalLabel,
  assertUserListPayload,
  assertUserCountPayload,
  registrationFieldErrors,
  registrationFailure,
};
