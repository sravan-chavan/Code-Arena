/**
 * Practice Arena membership is independent of contest assignment.
 *
 * questions.is_practice remains the Practice Arena flag. contest_questions
 * remains the contest membership source of truth. A question may be in
 * neither, either, or both. Existing rows are not rewritten.
 *
 * archived_at hides a question from the bank and Practice Arena when
 * permanent deletion would cascade through submissions or score history.
 * Contest links that already have history are left in place by application
 * code; this migration does not delete them.
 */

module.exports = {
  id: '015',
  name: 'independent_practice_membership',
  up: async (client) => {
    await client.query(`
      DROP TRIGGER IF EXISTS contest_questions_reject_practice_trg ON contest_questions
    `);
    await client.query(`
      DROP FUNCTION IF EXISTS contest_questions_reject_practice()
    `);
    await client.query(`
      ALTER TABLE questions
        ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS questions_practice_active_idx
        ON questions (sort_order, created_at)
        WHERE is_practice = TRUE AND archived_at IS NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS questions_archived_idx
        ON questions (archived_at DESC)
        WHERE archived_at IS NOT NULL
    `);
  },
  down: async (client) => {
    await client.query('DROP INDEX IF EXISTS questions_archived_idx');
    await client.query('DROP INDEX IF EXISTS questions_practice_active_idx');
    await client.query('ALTER TABLE questions DROP COLUMN IF EXISTS archived_at');
    await client.query(`
      CREATE OR REPLACE FUNCTION contest_questions_reject_practice()
      RETURNS trigger AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM questions WHERE id = NEW.question_id AND is_practice = TRUE
        ) THEN
          RAISE EXCEPTION 'Practice questions cannot be attached to a contest.'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS contest_questions_reject_practice_trg ON contest_questions
    `);
    await client.query(`
      CREATE TRIGGER contest_questions_reject_practice_trg
      BEFORE INSERT OR UPDATE OF question_id ON contest_questions
      FOR EACH ROW
      EXECUTE FUNCTION contest_questions_reject_practice()
    `);
  },
};
