/**
 * Milestone 2 foundation schema.
 *
 * Database conventions (apply to future business tables as well):
 * - Table and column names: snake_case
 * - Primary keys: UUID via gen_random_uuid() for entity tables; natural keys
 *   are acceptable for small lookup/system tables (this file uses a text key)
 * - Timestamps: TIMESTAMPTZ named created_at / updated_at, default NOW()
 * - Indexes: add for foreign keys and proven query paths; keep this table minimal
 *
 * Business schemas (users, roles, problems, contests, submissions, leaderboards)
 * belong to later milestones. Do not add them here.
 */

module.exports = {
  id: '001',
  name: 'create_app_meta',
  up: `
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS app_meta_updated_at_idx
      ON app_meta (updated_at);

    INSERT INTO app_meta (key, value)
    VALUES ('foundation', 'm2')
    ON CONFLICT (key) DO NOTHING;
  `,
  down: `
    DROP TABLE IF EXISTS app_meta;
  `,
};
