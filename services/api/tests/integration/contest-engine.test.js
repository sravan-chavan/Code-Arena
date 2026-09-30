const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { requirePostgres, uniqueEmail, restoreOpenEndedTestContest } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const { runMigrations } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');
const clock = require('../../src/contests/clock');

const ADMIN_EMAIL = 'admin@codearena.com';
const ADMIN_PASSWORD = 'Admin@123';
const STUDENT_PASSWORD = 'student-pass';
const T0 = '2026-09-30T10:00:00.000Z';
const START = '2026-09-30T11:00:00.000Z';
const MID = '2026-09-30T11:30:00.000Z';
const END = '2026-09-30T12:00:00.000Z';

describe('Contest engine (PostgreSQL)', () => {
  let app;
  let adminToken;
  let studentToken;
  let otherStudentToken;
  let studentEmail;
  let otherEmail;
  const createdContestIds = [];

  before(async () => {
    await requirePostgres();
    await runMigrations();
    await restoreOpenEndedTestContest();
    app = createApp();
    studentEmail = uniqueEmail('m9-student');
    otherEmail = uniqueEmail('m9-other');

    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminToken = adminLogin.body.data.token;

    await request(app)
      .post('/auth/register')
      .send({ email: studentEmail, password: STUDENT_PASSWORD })
      .expect(201);
    await request(app)
      .post('/auth/register')
      .send({ email: otherEmail, password: STUDENT_PASSWORD })
      .expect(201);

    studentToken = (await request(app)
      .post('/auth/login')
      .send({ email: studentEmail, password: STUDENT_PASSWORD })
      .expect(200)).body.data.token;
    otherStudentToken = (await request(app)
      .post('/auth/login')
      .send({ email: otherEmail, password: STUDENT_PASSWORD })
      .expect(200)).body.data.token;
  });

  afterEach(() => {
    clock.resetNow();
  });

  after(async () => {
    clock.resetNow();
    for (const id of createdContestIds) {
      await query('DELETE FROM contests WHERE id = $1', [id]).catch(() => {});
    }
    if (studentEmail) {
      await query('DELETE FROM users WHERE email = $1', [studentEmail]).catch(() => {});
    }
    if (otherEmail) {
      await query('DELETE FROM users WHERE email = $1', [otherEmail]).catch(() => {});
    }
    await closePool();
  });

  async function createDraft(overrides = {}) {
    clock.setNow(T0);
    const title = overrides.title || `M9 Contest ${Date.now()}-${Math.random()}`;
    const created = await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        description: overrides.description || 'Contest engine test',
        startTime: overrides.startTime === undefined ? START : overrides.startTime,
        endTime: overrides.endTime === undefined ? END : overrides.endTime,
        durationMinutes: overrides.durationMinutes,
      })
      .expect(201);
    const contest = created.body.data.contest;
    createdContestIds.push(contest.id);
    return contest;
  }

  async function addQuestion(contestId, title = 'Problem A') {
    const res = await request(app)
      .post(`/admin/contests/${contestId}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        description: `${title} statement`,
        inputFormat: 'none',
        outputFormat: 'ok',
        constraints: 'exact',
        difficulty: 'easy',
        testCases: [
          { stdin: '', expectedOutput: 'ok', isHidden: false },
          { stdin: '', expectedOutput: 'ok', isHidden: true },
        ],
      })
      .expect(201);
    return res.body.data.question;
  }

  it('rejects unauthenticated and wrong-role access to M9 endpoints', async () => {
    const contest = await createDraft();
    await request(app).get('/admin/contests').expect(401);
    await request(app).post(`/student/contests/${contest.id}/register`).expect(401);
    await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ title: 'Nope' })
      .expect(403);
    await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('creates a draft contest with UTC timestamps and rejects invalid windows', async () => {
    const contest = await createDraft({ title: `M9 Window ${Date.now()}` });
    assert.equal(contest.status, 'draft');
    assert.equal(contest.storedStatus, 'draft');
    assert.equal(contest.startTime, START);
    assert.equal(contest.endTime, END);
    assert.equal(contest.durationMinutes, 60);

    const row = await query(
      'SELECT status, start_time, end_time FROM contests WHERE id = $1',
      [contest.id],
    );
    assert.equal(row.rows[0].status, 'draft');
    assert.equal(row.rows[0].start_time.toISOString(), START);
    assert.equal(row.rows[0].end_time.toISOString(), END);

    await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'bad window', startTime: END, endTime: START })
      .expect(400);
  });

  it('schedules, rejects invalid transitions, and cancels a scheduled contest', async () => {
    const contest = await createDraft();
    clock.setNow(T0);
    const scheduled = await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(scheduled.body.data.contest.status, 'scheduled');
    assert.deepEqual(scheduled.body.data.contest.allowedActions, ['update', 'cancel']);

    await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    await request(app)
      .post(`/admin/contests/${contest.id}/end`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    const cancelled = await request(app)
      .post(`/admin/contests/${contest.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(cancelled.body.data.contest.status, 'cancelled');
    assert.deepEqual(cancelled.body.data.contest.allowedActions, []);
  });

  it('derives scheduled → running → ended from server time without sleeping', async () => {
    const contest = await createDraft();
    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    clock.setNow(T0);
    const before = await request(app)
      .get(`/admin/contests/${contest.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(before.body.data.contest.status, 'scheduled');
    assert.equal(before.body.data.contest.startsIn, 3600);

    clock.setNow(MID);
    const during = await request(app)
      .get(`/admin/contests/${contest.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(during.body.data.contest.status, 'running');
    assert.equal(during.body.data.contest.remainingTime, 30 * 60);
    assert.equal(during.body.data.contest.serverTime, MID);

    clock.setNow(END);
    const afterEnd = await request(app)
      .get(`/admin/contests/${contest.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(afterEnd.body.data.contest.status, 'ended');
  });

  it('registers a student once, stores a participant row, and blocks closed windows', async () => {
    const contest = await createDraft();
    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const listed = await request(app)
      .get('/student/contests')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const preview = listed.body.data.contests.find((row) => row.id === contest.id);
    assert.ok(preview);
    assert.equal(preview.canRegister, true);
    assert.equal(preview.registration, null);

    clock.setNow(T0);
    const registered = await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
    assert.equal(registered.body.data.registration.status, 'registered');

    const stored = await query(
      'SELECT status FROM contest_participants WHERE contest_id = $1',
      [contest.id],
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].status, 'registered');

    await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(409);

    const mine = await request(app)
      .get(`/student/contests/${contest.id}/registration`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(mine.body.data.registration.status, 'registered');

    const otherView = await request(app)
      .get(`/student/contests/${contest.id}/registration`)
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .expect(200);
    assert.equal(otherView.body.data.registration, null);

    clock.setNow(END);
    await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .expect(409);
  });

  it('rejects registration for draft, cancelled, and ended contests', async () => {
    const draft = await createDraft();
    await request(app)
      .post(`/student/contests/${draft.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(404);

    const toCancel = await createDraft();
    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${toCancel.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/admin/contests/${toCancel.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/student/contests/${toCancel.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(409);

    const ended = await createDraft();
    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${ended.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    clock.setNow(MID);
    await request(app)
      .post(`/admin/contests/${ended.id}/end`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/student/contests/${ended.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(409);
  });

  it('enforces unique (contest_id, user_id) at the database', async () => {
    const contest = await createDraft();
    const user = await query('SELECT id FROM users WHERE email = $1', [studentEmail]);
    await query(
      `INSERT INTO contest_participants (contest_id, user_id, status)
       VALUES ($1, $2, 'registered')`,
      [contest.id, user.rows[0].id],
    );
    await assert.rejects(
      () => query(
        `INSERT INTO contest_participants (contest_id, user_id, status)
         VALUES ($1, $2, 'registered')`,
        [contest.id, user.rows[0].id],
      ),
      (err) => err && err.code === '23505',
    );
  });

  it('orders contest problems and lists admin participants', async () => {
    const contest = await createDraft();
    const first = await addQuestion(contest.id, 'Alpha');
    const second = await addQuestion(contest.id, 'Beta');
    assert.equal(first.sortOrder, 0);
    assert.equal(second.sortOrder, 1);

    const reordered = await request(app)
      .patch(`/admin/contests/${contest.id}/questions/order`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ questionIds: [second.id, first.id] })
      .expect(200);
    assert.equal(reordered.body.data.questions[0].id, second.id);
    assert.equal(reordered.body.data.questions[0].sortOrder, 0);
    assert.equal(reordered.body.data.questions[1].id, first.id);
    assert.equal(reordered.body.data.questions[1].sortOrder, 1);

    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    const participants = await request(app)
      .get(`/admin/contests/${contest.id}/participants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(participants.body.data.participants.length, 1);
    assert.equal(participants.body.data.participants[0].email, studentEmail);
    assert.equal(participants.body.data.participants[0].status, 'registered');
  });

  it('blocks arena access until the contest is running and the student is registered', async () => {
    const contest = await createDraft();
    await addQuestion(contest.id);
    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const notStarted = await request(app)
      .get(`/student/contests/${contest.id}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
    assert.match(notStarted.body.message, /register/i);

    await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    const waiting = await request(app)
      .get(`/student/contests/${contest.id}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
    assert.match(waiting.body.message, /has not started/i);

    clock.setNow(MID);
    const open = await request(app)
      .get(`/student/contests/${contest.id}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(open.body.data.questions.length, 1);
    assert.equal(open.body.data.questions[0].testCases.length, 1);

    const unregistered = await request(app)
      .get(`/student/contests/${contest.id}/questions`)
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .expect(403);
    assert.match(unregistered.body.message, /register/i);
  });

  it('rejects contest execution after end and across contest boundaries', async () => {
    const contest = await createDraft();
    const question = await addQuestion(contest.id, 'Owned');
    const other = await createDraft({ title: `Other ${Date.now()}` });
    const foreign = await addQuestion(other.id, 'Foreign');

    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/admin/contests/${other.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    clock.setNow(MID);
    await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contestId: contest.id,
        questionId: foreign.id,
        language: 'python',
        sourceCode: 'print("ok")',
        kind: 'run',
      })
      .expect(400);

    await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contestId: contest.id,
        questionId: question.id,
        language: 'python',
        sourceCode: 'print("ok")',
        kind: 'run',
      })
      .expect(503);

    clock.setNow(END);
    const closed = await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        contestId: contest.id,
        questionId: question.id,
        language: 'python',
        sourceCode: 'print("ok")',
        kind: 'run',
      })
      .expect(409);
    assert.match(closed.body.message, /ended/i);
  });

  it('does not duplicate the Test development contest', async () => {
    const rows = await query(
      `SELECT COUNT(*)::int AS n FROM contests WHERE is_development_seed = TRUE AND title = 'Test'`,
    );
    assert.equal(rows.rows[0].n, 1);
    const columns = await query(
      `SELECT start_time, end_time, status FROM contests
       WHERE is_development_seed = TRUE AND title = 'Test'`,
    );
    assert.equal(columns.rows[0].start_time, null);
    assert.equal(columns.rows[0].end_time, null);
    assert.equal(columns.rows[0].status, 'running');
  });
});
