/**
 * Keep the development Test contest runnable for local E2E even after its
 * original duration window. Status stays running; remainingTime becomes null
 * so the UI shows the configured duration instead of 00:00.
 *
 * Idempotent: updating the same row again is a no-op.
 */

module.exports = {
  id: '006',
  name: 'keep_test_contest_open',
  up: `
    UPDATE contests
    SET start_time = NULL,
        updated_at = NOW()
    WHERE is_development_seed = TRUE
      AND title = 'Test'
      AND start_time IS NOT NULL
  `,
  down: `
    UPDATE contests
    SET start_time = created_at,
        updated_at = NOW()
    WHERE is_development_seed = TRUE
      AND title = 'Test'
      AND start_time IS NULL
  `,
};
