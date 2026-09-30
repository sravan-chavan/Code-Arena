/**
 * Question library unassigned state (M9 refinement).
 *
 * Allows contest_id NULL with is_practice FALSE (library questions not yet
 * attached to a contest). Practice remains contest_id NULL + is_practice TRUE.
 * Contest questions remain contest_id NOT NULL + is_practice FALSE.
 *
 * Does not alter existing contest or practice rows.
 */

module.exports = {
  id: '010',
  name: 'unassigned_questions',
  up: `
    ALTER TABLE questions
      DROP CONSTRAINT IF EXISTS questions_practice_xor_contest_check;

    ALTER TABLE questions
      DROP CONSTRAINT IF EXISTS questions_practice_contest_check;

    ALTER TABLE questions
      ADD CONSTRAINT questions_practice_contest_check
      CHECK (is_practice = FALSE OR contest_id IS NULL);

    CREATE INDEX IF NOT EXISTS questions_unassigned_idx
      ON questions (created_at DESC)
      WHERE contest_id IS NULL AND is_practice = FALSE;
  `,
  down: `
    DROP INDEX IF EXISTS questions_unassigned_idx;

    ALTER TABLE questions
      DROP CONSTRAINT IF EXISTS questions_practice_contest_check;

    ALTER TABLE questions
      ADD CONSTRAINT questions_practice_xor_contest_check
      CHECK (
        (is_practice = TRUE AND contest_id IS NULL)
        OR (is_practice = FALSE AND contest_id IS NOT NULL)
      );
  `,
};
