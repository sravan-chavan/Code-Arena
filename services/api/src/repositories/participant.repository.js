const { query, queryOne } = require('../db/query');

function mapParticipant(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    contestId: row.contest_id,
    userId: row.user_id,
    email: row.email,
    status: row.status,
    registeredAt: row.registered_at instanceof Date
      ? row.registered_at.toISOString()
      : row.registered_at,
    startedAt: row.started_at instanceof Date
      ? row.started_at.toISOString()
      : row.started_at,
    completedAt: row.completed_at instanceof Date
      ? row.completed_at.toISOString()
      : row.completed_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

function toPublic(participant) {
  if (!participant) {
    return null;
  }
  return {
    status: participant.status,
    registeredAt: participant.registeredAt,
    startedAt: participant.startedAt,
    completedAt: participant.completedAt,
  };
}

function toAdmin(participant) {
  if (!participant) {
    return null;
  }
  return {
    id: participant.id,
    userId: participant.userId,
    email: participant.email,
    status: participant.status,
    registeredAt: participant.registeredAt,
    startedAt: participant.startedAt,
    completedAt: participant.completedAt,
  };
}

async function create(input, client) {
  try {
    const row = await queryOne(
      `INSERT INTO contest_participants (contest_id, user_id, status)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.contestId, input.userId, input.status || 'registered'],
      client,
    );
    return mapParticipant(row);
  } catch (err) {
    if (err && err.code === '23505') {
      const duplicate = new Error('Already registered for this contest');
      duplicate.code = 'ALREADY_REGISTERED';
      throw duplicate;
    }
    throw err;
  }
}

async function findByContestAndUser(contestId, userId, client) {
  const row = await queryOne(
    `SELECT p.*, u.email
     FROM contest_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.contest_id = $1 AND p.user_id = $2`,
    [contestId, userId],
    client,
  );
  return mapParticipant(row);
}

async function listByContestId(contestId, client) {
  const result = await query(
    `SELECT p.*, u.email
     FROM contest_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.contest_id = $1
     ORDER BY p.registered_at ASC`,
    [contestId],
    client,
  );
  return result.rows.map(mapParticipant);
}

async function listByUserId(userId, client) {
  const result = await query(
    `SELECT p.*, u.email
     FROM contest_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = $1
     ORDER BY p.registered_at DESC`,
    [userId],
    client,
  );
  return result.rows.map(mapParticipant);
}

async function markStarted(id, client) {
  const row = await queryOne(
    `UPDATE contest_participants
     SET status = 'started',
         started_at = COALESCE(started_at, NOW()),
         updated_at = NOW()
     WHERE id = $1 AND status = 'registered'
     RETURNING *`,
    [id],
    client,
  );
  return mapParticipant(row);
}

module.exports = {
  mapParticipant,
  toPublic,
  toAdmin,
  create,
  findByContestAndUser,
  listByContestId,
  listByUserId,
  markStarted,
};
