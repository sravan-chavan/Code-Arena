const { toSafeUser } = require('../auth/auth.service');
const { ROLES } = require('../auth/roles');

/**
 * Admin application context for the authenticated identity.
 * Authorization is enforced by middleware; this only shapes the contract.
 */
function getMe(user) {
  return {
    user: toSafeUser(user),
    application: {
      name: 'CodeArena Admin',
      role: ROLES.ADMIN,
    },
  };
}

/**
 * Dashboard foundation metadata. No fabricated business metrics.
 */
function getDashboard() {
  return {
    application: 'admin',
    role: ROLES.ADMIN,
    status: 'ready',
  };
}

module.exports = {
  getMe,
  getDashboard,
};
