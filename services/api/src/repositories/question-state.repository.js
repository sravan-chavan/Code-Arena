const { query, queryOne } = require('../db/query');

function mapState(row) {
  if (!row) {
    return null;
  }
  return {
    contestId: row.contest_id,
    participantId: row.participant_id,
    questionId: row.question_id,
    invalidated: Boolean(row.invalidated),
    invalidationReason: row.invalidation_reason || null,
    invalidatedAt: row.invalidated_at instanceof Date
      ? row.invalidated_at.toISOString()
      : row.invalidated_at,
    earnedPoints: Number(row.earned_points || 0),
    possiblePoints: Number(row.possible_points || 0),
  };
}

async function find(contestId, participantId, questionId, client) {
  const row = await queryOne(
    `SELECT * FROM participant_question_states
     WHERE contest_id = $1 AND participant_id = $2 AND question_id = $3`,
    [contestId, participantId, questionId],
    client,
  );
  return mapState(row);
}

async function listByParticipant(contestId, participantId, client) {
  const result = await query(
    `SELECT * FROM participant_question_states
     WHERE contest_id = $1 AND participant_id = $2`,
    [contestId, participantId],
    client,
  );
  return result.rows.map(mapState);
}

async function upsert(input, client) {
  const row = await queryOne(
    `INSERT INTO participant_question_states (
       contest_id, participant_id, question_id, invalidated, invalidation_reason,
       invalidated_at, earned_points, possible_points
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (contest_id, participant_id, question_id)
     DO UPDATE SET
       invalidated = EXCLUDED.invalidated OR participant_question_states.invalidated,
       invalidation_reason = COALESCE(
         participant_question_states.invalidation_reason,
         EXCLUDED.invalidation_reason
       ),
       invalidated_at = COALESCE(
         participant_question_states.invalidated_at,
         EXCLUDED.invalidated_at
       ),
       earned_points = CASE
         WHEN participant_question_states.invalidated OR EXCLUDED.invalidated THEN 0
         ELSE GREATEST(participant_question_states.earned_points, EXCLUDED.earned_points)
       END,
       possible_points = CASE
         WHEN participant_question_states.invalidated OR EXCLUDED.invalidated THEN 0
         ELSE EXCLUDED.possible_points
       END,
       updated_at = NOW()
     RETURNING *`,
    [
      input.contestId,
      input.participantId,
      input.questionId,
      Boolean(input.invalidated),
      input.invalidationReason || null,
      input.invalidatedAt || null,
      Number(input.earnedPoints || 0),
      Number(input.possiblePoints || 0),
    ],
    client,
  );
  return mapState(row);
}

async function invalidate(input, client) {
  const row = await queryOne(
    `INSERT INTO participant_question_states (
       contest_id, participant_id, question_id, invalidated, invalidation_reason,
       invalidated_at, earned_points, possible_points
     )
     VALUES ($1, $2, $3, TRUE, $4, $5, 0, $6)
     ON CONFLICT (contest_id, participant_id, question_id)
     DO UPDATE SET
       invalidated = TRUE,
       invalidation_reason = COALESCE(
         participant_question_states.invalidation_reason,
         EXCLUDED.invalidation_reason
       ),
       invalidated_at = COALESCE(
         participant_question_states.invalidated_at,
         EXCLUDED.invalidated_at
       ),
       earned_points = 0,
       possible_points = EXCLUDED.possible_points,
       updated_at = NOW()
     RETURNING *`,
    [
      input.contestId,
      input.participantId,
      input.questionId,
      input.invalidationReason || 'TAB_SWITCH',
      input.invalidatedAt,
      Number(input.possiblePoints || 0),
    ],
    client,
  );
  return mapState(row);
}

module.exports = {
  mapState,
  find,
  listByParticipant,
  upsert,
  invalidate,
};
