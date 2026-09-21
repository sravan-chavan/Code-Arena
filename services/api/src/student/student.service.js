const { toSafeUser } = require('../auth/auth.service');
const { ROLES } = require('../auth/roles');

/**
 * Participant application context for the authenticated identity.
 * Authorization is enforced by middleware; this only shapes the contract.
 */
function getMe(user) {
  return {
    user: toSafeUser(user),
    application: {
      name: 'CodeArena Participant',
      role: ROLES.STUDENT,
    },
  };
}

/**
 * Dashboard foundation metadata. No fabricated business metrics.
 */
function getDashboard() {
  return {
    application: 'participant',
    role: ROLES.STUDENT,
    status: 'ready',
  };
}

module.exports = {
  getMe,
  getDashboard,
};
