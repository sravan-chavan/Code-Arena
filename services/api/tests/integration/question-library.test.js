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

describe('Question library unassigned attach (PostgreSQL)', () => {
  let app;
  let adminToken;
  let studentToken;
  const createdContestIds = [];
  const createdQuestionIds = [];

  before(async () => {
    await requirePostgres();
    await runMigrations();
    await restoreOpenEndedTestContest();
    app = createApp();

    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);
    adminToken = adminLogin.body.data.token;

    const email = uniqueEmail('m9-library');
    await request(app).post('/auth/register').send({ email, password: STUDENT_PASSWORD }).expect(201);
    studentToken = (await request(app)
      .post('/auth/login')
      .send({ email, password: STUDENT_PASSWORD })
      .expect(200)).body.data.token;
  });

  afterEach(() => {
    clock.resetNow();
  });

  after(async () => {
    clock.resetNow();
    for (const id of createdQuestionIds) {
      await query('DELETE FROM questions WHERE id = $1', [id]).catch(() => {});
    }
    for (const id of createdContestIds) {
      await query('DELETE FROM contests WHERE id = $1', [id]).catch(() => {});
    }
    await closePool();
  });

  async function createDraft() {
    clock.setNow(T0);
    const created = await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Library Contest ${Date.now()}-${Math.random()}`,
        description: 'Question library attach test',
        startTime: START,
        endTime: END,
      })
      .expect(201);
    const contest = created.body.data.contest;
    createdContestIds.push(contest.id);
    return contest;
  }

  function libraryPayload(title, contestId) {
    const body = {
      title,
      description: `${title} statement`,
      inputFormat: 'none',
      outputFormat: 'ok',
      constraints: 'exact',
      difficulty: 'easy',
      testCases: [
        { stdin: '', expectedOutput: 'ok', isHidden: false },
        { stdin: 'hidden', expectedOutput: 'secret', isHidden: true },
      ],
    };
    if (contestId !== undefined) {
      body.contestId = contestId;
    }
    return body;
  }

  it('persists the three question assignment states in PostgreSQL', async () => {
    const table = await query(`SELECT to_regclass('public.contest_questions') AS rel`);
    assert.ok(table.rows[0].rel);

    const xorGone = await query(
      `SELECT 1 FROM pg_constraint WHERE conname IN ('questions_practice_xor_contest_check', 'questions_practice_contest_check')`,
    );
    assert.equal(xorGone.rows.length, 0);

    const contestIdGone = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'questions' AND column_name = 'contest_id'`,
    );
    assert.equal(contestIdGone.rows.length, 0);

    const practice = await query(
      `SELECT q.id, q.is_practice
       FROM questions q
       WHERE q.is_practice = TRUE AND q.is_development_seed = TRUE
       LIMIT 1`,
    );
    assert.ok(practice.rows[0]);
    assert.equal(practice.rows[0].is_practice, true);
    const practiceLinks = await query(
      `SELECT 1 FROM contest_questions WHERE question_id = $1`,
      [practice.rows[0].id],
    );
    assert.equal(practiceLinks.rows.length, 0);

    const contestQuestion = await query(
      `SELECT cq.contest_id, q.is_practice
       FROM contest_questions cq
       INNER JOIN questions q ON q.id = cq.question_id
       WHERE q.is_practice = FALSE
       LIMIT 1`,
    );
    assert.ok(contestQuestion.rows[0]);
    assert.ok(contestQuestion.rows[0].contest_id);
    assert.equal(contestQuestion.rows[0].is_practice, false);
  });

  it('creates an unassigned library question and lists it', async () => {
    const created = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(libraryPayload('M9 Library Unassigned'))
      .expect(201);
    const question = created.body.data.question;
    createdQuestionIds.push(question.id);
    assert.equal(question.contestId, null);
    assert.equal(question.isPractice, false);
    assert.equal(question.assignment, 'unassigned');

    const stored = await query(
      'SELECT id, is_practice FROM questions WHERE id = $1',
      [question.id],
    );
    assert.equal(stored.rows[0].is_practice, false);
    const links = await query(
      'SELECT 1 FROM contest_questions WHERE question_id = $1',
      [question.id],
    );
    assert.equal(links.rows.length, 0);

    const listed = await request(app)
      .get('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = listed.body.data.questions.find((item) => item.id === question.id);
    assert.ok(row);
    assert.equal(row.assignment, 'unassigned');
    assert.equal(row.contestId, null);
    assert.equal(row.contestTitle, null);

    const practiceRow = listed.body.data.questions.find((item) => item.isPractice);
    assert.ok(practiceRow);
    assert.equal(practiceRow.assignment, 'practice');
    assert.equal(practiceRow.contestId, null);
  });

  it('attaches an unassigned question without copying it and appends sort_order', async () => {
    const contest = await createDraft();
    const first = await request(app)
      .post(`/admin/contests/${contest.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(libraryPayload('Alpha'))
      .expect(201);
    const second = await request(app)
      .post(`/admin/contests/${contest.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(libraryPayload('Beta'))
      .expect(201);
    assert.equal(first.body.data.question.sortOrder, 0);
    assert.equal(second.body.data.question.sortOrder, 1);

    const created = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(libraryPayload('Gamma'))
      .expect(201);
    const unassigned = created.body.data.question;
    createdQuestionIds.push(unassigned.id);

    const attached = await request(app)
      .post(`/admin/contests/${contest.id}/questions/${unassigned.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(attached.body.data.question.id, unassigned.id);
    assert.equal(attached.body.data.question.contestId, contest.id);
    assert.equal(attached.body.data.question.isPractice, false);
    assert.equal(attached.body.data.question.assignment, 'contest');
    assert.equal(attached.body.data.question.sortOrder, 2);
    assert.equal(attached.body.data.question.title, 'Gamma');

    const stored = await query(
      `SELECT cq.contest_id, cq.sort_order, q.id, q.is_practice
       FROM questions q
       JOIN contest_questions cq ON cq.question_id = q.id
       WHERE q.id = $1 AND cq.contest_id = $2`,
      [unassigned.id, contest.id],
    );
    assert.equal(stored.rows[0].id, unassigned.id);
    assert.equal(stored.rows[0].contest_id, contest.id);
    assert.equal(stored.rows[0].is_practice, false);
    assert.equal(stored.rows[0].sort_order, 2);

    const contestQuestions = await request(app)
      .get(`/admin/contests/${contest.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.deepEqual(
      contestQuestions.body.data.questions.map((item) => item.title),
      ['Alpha', 'Beta', 'Gamma'],
    );

    const reordered = await request(app)
      .patch(`/admin/contests/${contest.id}/questions/order`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        questionIds: [
          unassigned.id,
          first.body.data.question.id,
          second.body.data.question.id,
        ],
      })
      .expect(200);
    assert.deepEqual(
      reordered.body.data.questions.map((item) => item.id),
      [unassigned.id, first.body.data.question.id, second.body.data.question.id],
    );
    assert.equal(reordered.body.data.questions[0].sortOrder, 0);
  });

  it('rejects duplicate attachment, allows one question on many contests, and keeps practice membership', async () => {
    const contestA = await createDraft();
    const contestB = await createDraft();
    const created = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(libraryPayload('Attach Guard'))
      .expect(201);
    const question = created.body.data.question;
    createdQuestionIds.push(question.id);

    await request(app)
      .post(`/admin/contests/${contestA.id}/questions/${question.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const duplicate = await request(app)
      .post(`/admin/contests/${contestA.id}/questions/${question.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    assert.equal(duplicate.body.success, false);
    assert.match(duplicate.body.message, /already belongs to this contest/i);

    const shared = await request(app)
      .post(`/admin/contests/${contestB.id}/questions/${question.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(shared.body.data.question.id, question.id);
    const links = await query(
      `SELECT contest_id FROM contest_questions WHERE question_id = $1 ORDER BY contest_id`,
      [question.id],
    );
    assert.equal(links.rows.length, 2);

    const practice = await query(
      `SELECT id FROM questions WHERE is_practice = TRUE AND is_development_seed = TRUE LIMIT 1`,
    );
    const practiceAttach = await request(app)
      .post(`/admin/contests/${contestA.id}/questions/${practice.rows[0].id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(practiceAttach.body.data.question.id, practice.rows[0].id);
    assert.equal(practiceAttach.body.data.question.isPractice, true);
    assert.equal(practiceAttach.body.data.question.assignment, 'both');
    const practiceStill = await query(
      'SELECT is_practice FROM questions WHERE id = $1',
      [practice.rows[0].id],
    );
    assert.equal(practiceStill.rows[0].is_practice, true);

    await request(app)
      .post(`/admin/contests/${contestA.id}/questions/${question.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
    await request(app)
      .post(`/admin/questions`)
      .send(libraryPayload('Nope'))
      .expect(401);

    const missingContest = await request(app)
      .post(`/admin/contests/00000000-0000-4000-8000-000000000099/questions/${question.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    assert.match(missingContest.body.message, /contest not found/i);

    const missingQuestion = await request(app)
      .post(`/admin/contests/${contestA.id}/questions/00000000-0000-4000-8000-000000000098`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    assert.match(missingQuestion.body.message, /question not found/i);

    await query(
      'DELETE FROM contest_questions WHERE question_id = $1 AND contest_id = $2',
      [practice.rows[0].id, contestA.id],
    );
  });

  it('exposes an attached question to students without hidden tests', async () => {
    const contest = await createDraft();
    const created = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(libraryPayload('Student Visible'))
      .expect(201);
    const question = created.body.data.question;
    createdQuestionIds.push(question.id);

    await request(app)
      .post(`/admin/contests/${contest.id}/questions/${question.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/student/contests/${contest.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    clock.setNow(MID);
    const studentQuestions = await request(app)
      .get(`/student/contests/${contest.id}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(studentQuestions.body.data.questions.length, 1);
    assert.equal(studentQuestions.body.data.questions[0].id, question.id);
    assert.equal(studentQuestions.body.data.questions[0].title, 'Student Visible');
    assert.equal(studentQuestions.body.data.questions[0].description, 'Student Visible statement');
    assert.equal(studentQuestions.body.data.questions[0].isPractice, undefined);
    assert.ok(studentQuestions.body.data.questions[0].testCases.every((testCase) => testCase.isHidden === false));
    assert.equal(studentQuestions.body.data.questions[0].testCases.length, 1);
    assert.notEqual(studentQuestions.body.data.questions[0].sampleOutput, 'secret');
  });

  it('does not treat unassigned library questions as practice problems', async () => {
    const created = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...libraryPayload('Not Practice'), contestId: 'unassigned' })
      .expect(201);
    const question = created.body.data.question;
    createdQuestionIds.push(question.id);
    assert.equal(question.contestId, null);
    assert.equal(question.isPractice, false);
    assert.equal(question.assignment, 'unassigned');

    const practice = await request(app)
      .get('/student/practice/problems')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(
      practice.body.data.problems.some((problem) => problem.id === question.id),
      false,
    );

    const contests = await request(app)
      .get('/student/contests')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const testContest = contests.body.data.contests.find((contest) => contest.title === 'Test');
    assert.ok(testContest);
    await request(app)
      .post(`/student/contests/${testContest.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
    const contestQuestions = await request(app)
      .get(`/student/contests/${testContest.id}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(
      contestQuestions.body.data.questions.some((item) => item.id === question.id),
      false,
    );
  });
});
