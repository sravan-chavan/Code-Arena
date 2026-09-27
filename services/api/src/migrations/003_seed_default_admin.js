/**
 * Default local ADMIN account for a fresh CodeArena database.
 *
 * Public registration still cannot create ADMIN. This seed runs once as
 * migration 003 during API startup (Docker Compose included).
 *
 * Idempotent: if admin@codearena.com already exists, do nothing. Do not
 * overwrite password_hash or role on later startups.
 */

const userRepository = require('../repositories/user.repository');
const { hashPassword } = require('../auth/password');
const { normalizeEmail } = require('../auth/email');
const { ROLES } = require('../auth/roles');

const DEFAULT_ADMIN_EMAIL = 'admin@codearena.com';

module.exports = {
  id: '003',
  name: 'seed_default_admin',
  up: async (client) => {
    const email = normalizeEmail('admin@codearena.com');
    const existing = await userRepository.findByEmail(email, client);
    if (existing) {
      return;
    }

    const passwordHash = await hashPassword('Admin@123');
    try {
      await userRepository.create(
        {
          email,
          passwordHash,
          role: ROLES.ADMIN,
        },
        client,
      );
    } catch (err) {
      if (err && err.code === 'EMAIL_TAKEN') {
        return;
      }
      throw err;
    }
  },
  down: async (client) => {
    const email = normalizeEmail(DEFAULT_ADMIN_EMAIL);
    await client.query('DELETE FROM users WHERE email = $1', [email]);
  },
};
