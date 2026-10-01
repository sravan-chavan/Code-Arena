/**
 * M11 amendments: exit/re-add history and contest resume timestamp.
 *
 * Does not add a second participant row. Historical submissions, scores,
 * penalties, and violations stay on the existing participant.
 */

module.exports = {
  id: '014',
  name: 'participation_resume',
  up: `
    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS exited_at TIMESTAMPTZ;

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS readded_at TIMESTAMPTZ;

    ALTER TABLE contest_participants
      ADD COLUMN IF NOT EXISTS readd_count INTEGER NOT NULL DEFAULT 0;

    UPDATE contest_participants
    SET exited_at = completed_at
    WHERE status = 'exited'
      AND exited_at IS NULL
      AND completed_at IS NOT NULL;

    UPDATE contest_participants
    SET removed_at = completed_at
    WHERE status = 'removed'
      AND removed_at IS NULL
      AND completed_at IS NOT NULL;

    ALTER TABLE contests
      ADD COLUMN IF NOT EXISTS resumed_at TIMESTAMPTZ;
  `,
  down: `
    ALTER TABLE contests DROP COLUMN IF EXISTS resumed_at;

    ALTER TABLE contest_participants DROP COLUMN IF EXISTS readd_count;
    ALTER TABLE contest_participants DROP COLUMN IF EXISTS readded_at;
    ALTER TABLE contest_participants DROP COLUMN IF EXISTS removed_at;
    ALTER TABLE contest_participants DROP COLUMN IF EXISTS exited_at;
  `,
};
