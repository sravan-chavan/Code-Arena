const { query, queryOne } = require('../db/query');

function iso(value) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

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
    registeredAt: iso(row.registered_at),
    startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at),
    effectiveDeadline: iso(row.effective_deadline),
    currentQuestionId: row.current_question_id || null,
    tabSwitchCount: row.tab_switch_count === undefined || row.tab_switch_count === null
      ? 0
      : Number(row.tab_switch_count),
    lastTabSwitchAt: iso(row.last_tab_switch_at),
    score: row.score === undefined || row.score === null ? 0 : Number(row.score),
    penalty: row.penalty === undefined || row.penalty === null ? 0 : Number(row.penalty),
    possibleScore: row.possible_score === undefined || row.possible_score === null
      ? 0
      : Number(row.possible_score),
    solvedCount: row.solved_count === undefined || row.solved_count === null
      ? 0
      : Number(row.solved_count),
    lastScoringAt: iso(row.last_scoring_at),
    exitedAt: iso(row.exited_at),
    removedAt: iso(row.removed_at),
    readdedAt: iso(row.readded_at),
    readdCount: row.readd_count === undefined || row.readd_count === null
      ? 0
      : Number(row.readd_count),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
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
    effectiveDeadline: participant.effectiveDeadline,
    currentQuestionId: participant.currentQuestionId,
    tabSwitchCount: participant.tabSwitchCount,
    score: participant.score,
    penalty: participant.penalty,
    possibleScore: participant.possibleScore,
    solvedCount: participant.solvedCount,
    exitedAt: participant.exitedAt || null,
    readdCount: participant.readdCount || 0,
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
    effectiveDeadline: participant.effectiveDeadline,
    currentQuestionId: participant.currentQuestionId,
    tabSwitchCount: participant.tabSwitchCount,
    lastTabSwitchAt: participant.lastTabSwitchAt,
    score: participant.score,
    penalty: participant.penalty,
    possibleScore: participant.possibleScore,
    solvedCount: participant.solvedCount,
    lastScoringAt: participant.lastScoringAt,
    exitedAt: participant.exitedAt || null,
    removedAt: participant.removedAt || null,
    readdedAt: participant.readdedAt || null,
    readdCount: participant.readdCount || 0,
  };
}

function toSession(participant, extras = {}) {
  if (!participant) {
    return null;
  }
  return {
    participantId: participant.id,
    status: participant.status,
    registeredAt: participant.registeredAt,
    startedAt: participant.startedAt,
    completedAt: participant.completedAt,
    effectiveDeadline: participant.effectiveDeadline,
    currentQuestionId: participant.currentQuestionId,
    tabSwitchCount: participant.tabSwitchCount,
    score: participant.score,
    penalty: participant.penalty,
    possibleScore: participant.possibleScore,
    solvedCount: participant.solvedCount,
    exitedAt: participant.exitedAt || null,
    readdCount: participant.readdCount || 0,
    ...extras,
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

async function findById(id, client) {
  const row = await queryOne(
    `SELECT p.*, u.email
     FROM contest_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = $1`,
    [id],
    client,
  );
  return mapParticipant(row);
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

async function update(id, fields, client) {
  const sets = [];
  const values = [];
  let index = 1;
  const columns = {
    status: 'status',
    startedAt: 'started_at',
    completedAt: 'completed_at',
    effectiveDeadline: 'effective_deadline',
    currentQuestionId: 'current_question_id',
    tabSwitchCount: 'tab_switch_count',
    lastTabSwitchAt: 'last_tab_switch_at',
    score: 'score',
    penalty: 'penalty',
    possibleScore: 'possible_score',
    solvedCount: 'solved_count',
    lastScoringAt: 'last_scoring_at',
    exitedAt: 'exited_at',
    removedAt: 'removed_at',
    readdedAt: 'readded_at',
    readdCount: 'readd_count',
  };
  for (const [key, column] of Object.entries(columns)) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      sets.push(`${column} = $${index}`);
      values.push(fields[key]);
      index += 1;
    }
  }
  if (sets.length === 0) {
    return findById(id, client);
  }
  sets.push('updated_at = NOW()');
  values.push(id);
  await queryOne(
    `UPDATE contest_participants SET ${sets.join(', ')} WHERE id = $${index} RETURNING id`,
    values,
    client,
  );
  return findById(id, client);
}

module.exports = {
  mapParticipant,
  toPublic,
  toAdmin,
  toSession,
  create,
  findById,
  findByContestAndUser,
  listByContestId,
  listByUserId,
  markStarted,
  update,
};
