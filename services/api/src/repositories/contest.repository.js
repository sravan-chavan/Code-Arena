const { query, queryOne } = require('../db/query');

function mapContest(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    startTime: row.start_time instanceof Date ? row.start_time.toISOString() : row.start_time,
    endTime: row.end_time instanceof Date ? row.end_time.toISOString() : row.end_time,
    durationMinutes: row.duration_minutes,
    resumedAt: row.resumed_at instanceof Date
      ? row.resumed_at.toISOString()
      : (row.resumed_at || null),
    createdBy: row.created_by,
    isDevelopmentSeed: row.is_development_seed,
    questionCount: row.question_count === undefined ? undefined : Number(row.question_count),
    participantCount: row.participant_count === undefined ? undefined : Number(row.participant_count),
    totalPoints: row.total_points === undefined ? undefined : Number(row.total_points),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

const COUNT_SELECT = `
  SELECT c.*, (
    SELECT COUNT(*)::int FROM contest_questions cq WHERE cq.contest_id = c.id
  ) AS question_count, (
    SELECT COUNT(*)::int FROM contest_participants p WHERE p.contest_id = c.id
  ) AS participant_count, (
    SELECT COALESCE(SUM(tc.points), 0)::int
    FROM contest_questions cq
    JOIN question_test_cases tc ON tc.question_id = cq.question_id
    WHERE cq.contest_id = c.id
  ) AS total_points
  FROM contests c
`;

async function create(input, client) {
  const row = await queryOne(
    `INSERT INTO contests (
       title, description, status, start_time, duration_minutes, created_by, is_development_seed
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.title,
      input.description || '',
      input.status || 'draft',
      input.startTime || null,
      input.durationMinutes || 60,
      input.createdBy,
      Boolean(input.isDevelopmentSeed),
    ],
    client,
  );
  let mapped = mapContest(row);
  if (input.endTime) {
    const withEnd = await queryOne(
      `UPDATE contests SET end_time = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [row.id, input.endTime],
      client,
    );
    mapped = mapContest(withEnd);
  }
  return {
    ...mapped,
    questionCount: 0,
    participantCount: 0,
    totalPoints: 0,
  };
}

async function findById(id, client) {
  const row = await queryOne(
    `${COUNT_SELECT}
     WHERE c.id = $1`,
    [id],
    client,
  );
  return mapContest(row);
}

async function findDevelopmentSeedByTitle(title, client) {
  const row = await queryOne(
    `SELECT * FROM contests
     WHERE is_development_seed = TRUE AND title = $1
     LIMIT 1`,
    [title],
    client,
  );
  return mapContest(row);
}

async function listAll(client) {
  const result = await query(
    `${COUNT_SELECT}
     ORDER BY c.created_at DESC`,
    [],
    client,
  );
  return result.rows.map(mapContest);
}

async function listByStoredStatuses(statuses, client) {
  const result = await query(
    `SELECT id, title, status, start_time, end_time, duration_minutes
     FROM contests
     WHERE status = ANY($1::text[])`,
    [statuses],
    client,
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    startTime: row.start_time instanceof Date ? row.start_time.toISOString() : row.start_time,
    endTime: row.end_time instanceof Date ? row.end_time.toISOString() : row.end_time,
    durationMinutes: row.duration_minutes,
  }));
}

async function listVisibleToStudents(client) {
  const result = await query(
    `${COUNT_SELECT}
     WHERE c.status IN ('scheduled', 'running', 'ended', 'cancelled')
     ORDER BY
       CASE c.status
         WHEN 'running' THEN 0
         WHEN 'scheduled' THEN 1
         WHEN 'ended' THEN 2
         ELSE 3
       END,
       c.created_at DESC`,
    [],
    client,
  );
  return result.rows.map(mapContest);
}

async function update(id, fields, client) {
  const sets = [];
  const values = [];
  let index = 1;
  const columns = {
    title: 'title',
    description: 'description',
    status: 'status',
    startTime: 'start_time',
    endTime: 'end_time',
    durationMinutes: 'duration_minutes',
    resumedAt: 'resumed_at',
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
    `UPDATE contests SET ${sets.join(', ')} WHERE id = $${index} RETURNING id`,
    values,
    client,
  );
  return findById(id, client);
}

module.exports = {
  mapContest,
  create,
  findById,
  findDevelopmentSeedByTitle,
  listAll,
  listByStoredStatuses,
  listVisibleToStudents,
  update,
};
