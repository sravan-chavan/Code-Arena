/**
 * Milestone 3 — users table for authentication and RBAC.
 *
 * ID strategy: UUID primary key via gen_random_uuid(), matching the entity-table
 * convention documented in 001_create_app_meta.js. Do not introduce a second
 * identifier scheme.
 *
 * Email is the unique login identifier. The application always stores a
 * trimmed, lowercased value; the CHECK constraint enforces that invariant so
 * uniqueness cannot be bypassed by casing or surrounding whitespace.
 *
 * Roles are constrained with CHECK (not a PostgreSQL ENUM) so future role
 * additions remain ordinary migrations rather than ENUM alterations.
 */

module.exports = {
  id: '002',
  name: 'create_users',
  up: `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'STUDENT',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT users_email_key UNIQUE (email),
      CONSTRAINT users_email_normalized_check
        CHECK (email <> '' AND email = lower(email) AND email = btrim(email)),
      CONSTRAINT users_password_hash_present_check
        CHECK (password_hash <> ''),
      CONSTRAINT users_role_check
        CHECK (role IN ('ADMIN', 'STUDENT'))
    );
  `,
  down: `
    DROP TABLE IF EXISTS users;
  `,
};
