/**
 * Contest engine (M9): end_time, cancelled status, and participant registration.
 *
 * Reuses the existing contests/questions tables. Does not seed another Test contest.
 * Backfills end_time from start_time + duration_minutes where a window already exists.
 * The development Test contest keeps NULL start/end times (open-ended, still running).
 */

module.exports = {
  id: '009',
  name: 'contest_engine',
  up: `
    ALTER TABLE contests
      ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;

    UPDATE contests
    SET end_time = start_time + (duration_minutes * INTERVAL '1 minute')
    WHERE start_time IS NOT NULL
      AND end_time IS NULL
      AND duration_minutes IS NOT NULL
      AND duration_minutes > 0;

    ALTER TABLE contests
      DROP CONSTRAINT IF EXISTS contests_status_check;

    ALTER TABLE contests
      ADD CONSTRAINT contests_status_check
        CHECK (status IN ('draft', 'scheduled', 'running', 'ended', 'cancelled'));

    ALTER TABLE contests
      DROP CONSTRAINT IF EXISTS contests_time_window_check;

    ALTER TABLE contests
      ADD CONSTRAINT contests_time_window_check
        CHECK (
          end_time IS NULL
          OR start_time IS NULL
          OR end_time > start_time
        );

    CREATE INDEX IF NOT EXISTS contests_start_time_idx ON contests (start_time);
    CREATE INDEX IF NOT EXISTS contests_end_time_idx ON contests (end_time);

    CREATE TABLE IF NOT EXISTS contest_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'registered',
      registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT contest_participants_status_check
        CHECK (status IN ('registered', 'started', 'completed')),
      CONSTRAINT contest_participants_contest_user_unique UNIQUE (contest_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS contest_participants_user_idx
      ON contest_participants (user_id, registered_at DESC);
    CREATE INDEX IF NOT EXISTS contest_participants_contest_idx
      ON contest_participants (contest_id, registered_at DESC);
  `,
  down: `
    DROP TABLE IF EXISTS contest_participants;

    DROP INDEX IF EXISTS contests_end_time_idx;
    DROP INDEX IF EXISTS contests_start_time_idx;

    ALTER TABLE contests
      DROP CONSTRAINT IF EXISTS contests_time_window_check;

    ALTER TABLE contests
      DROP CONSTRAINT IF EXISTS contests_status_check;

    ALTER TABLE contests
      ADD CONSTRAINT contests_status_check
        CHECK (status IN ('draft', 'scheduled', 'running', 'ended'));

    ALTER TABLE contests
      DROP COLUMN IF EXISTS end_time;
  `,
};
