const { query, queryOne } = require('../db/query');

function iso(value) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function mapViolation(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    contestId: row.contest_id,
    participantId: row.participant_id,
    questionId: row.question_id,
    type: row.type,
    sequence: Number(row.sequence || 0),
    occurredAt: iso(row.occurred_at),
    metadata: row.metadata || {},
    email: row.email,
  };
}

async function create(input, client) {
  const row = await queryOne(
    `INSERT INTO contest_violations (
       contest_id, participant_id, question_id, type, sequence, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [
      input.contestId,
      input.participantId,
      input.questionId || null,
      input.type,
      input.sequence,
      JSON.stringify(input.metadata || {}),
    ],
    client,
  );
  return mapViolation(row);
}

async function listByContest(contestId, client) {
  const result = await query(
    `SELECT v.*, u.email
     FROM contest_violations v
     JOIN contest_participants p ON p.id = v.participant_id
     JOIN users u ON u.id = p.user_id
     WHERE v.contest_id = $1
     ORDER BY v.occurred_at DESC`,
    [contestId],
    client,
  );
  return result.rows.map(mapViolation);
}

async function findByClientEventId(participantId, clientEventId, client) {
  if (!participantId || !clientEventId) {
    return null;
  }
  const row = await queryOne(
    `SELECT v.*, u.email
     FROM contest_violations v
     JOIN contest_participants p ON p.id = v.participant_id
     JOIN users u ON u.id = p.user_id
     WHERE v.participant_id = $1
       AND v.metadata->>'clientEventId' = $2
     ORDER BY v.occurred_at ASC
     LIMIT 1`,
    [participantId, clientEventId],
    client,
  );
  return mapViolation(row);
}

async function listByParticipant(contestId, participantId, client) {
  const result = await query(
    `SELECT v.*, u.email
     FROM contest_violations v
     JOIN contest_participants p ON p.id = v.participant_id
     JOIN users u ON u.id = p.user_id
     WHERE v.contest_id = $1 AND v.participant_id = $2
     ORDER BY v.occurred_at DESC`,
    [contestId, participantId],
    client,
  );
  return result.rows.map(mapViolation);
}

module.exports = {
  mapViolation,
  create,
  findByClientEventId,
  listByContest,
  listByParticipant,
};
