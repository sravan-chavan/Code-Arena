const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  STUDENT: 'STUDENT',
});

const ROLE_VALUES = Object.freeze([ROLES.ADMIN, ROLES.STUDENT]);

function isRole(value) {
  return ROLE_VALUES.includes(value);
}

module.exports = {
  ROLES,
  ROLE_VALUES,
  isRole,
};
