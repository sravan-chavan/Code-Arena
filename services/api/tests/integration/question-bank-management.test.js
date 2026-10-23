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

describe('Question bank placement (PostgreSQL)', () => {
  let app;
  let adminToken;
  let studentToken;
  let studentId;
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

    const email = uniqueEmail('question-bank');
    await request(app).post('/auth/register').send({ email, password: STUDENT_PASSWORD }).expect(201);
    const studentLogin = await request(app)
      .post('/auth/login')
      .send({ email, password: STUDENT_PASSWORD })
      .expect(200);
    studentToken = studentLogin.body.data.token;
    const studentRow = await query('SELECT id FROM users WHERE email = $1', [email]);
    studentId = studentRow.rows[0].id;
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
    if (studentId) {
      await query('DELETE FROM users WHERE id = $1', [studentId]).catch(() => {});
    }
    await closePool();
  });

  function payload(title, extra = {}) {
    return {
      title,
      description: `${title} statement token-bank-search`,
      inputFormat: 'two integers',
      outputFormat: 'one integer',
      constraints: 'exact match',
      difficulty: 'hard',
      testCases: [
        { stdin: '1 2', expectedOutput: '3', isHidden: false },
        { stdin: 'hidden', expectedOutput: 'secret-bank', isHidden: true },
      ],
      ...extra,
    };
  }

  async function createDraft(label) {
    clock.setNow(T0);
    const created = await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Bank Contest ${label} ${Date.now()}-${Math.random()}`,
        description: 'Question bank placement',
        startTime: START,
        endTime: END,
      })
      .expect(201);
    const contest = created.body.data.contest;
    createdContestIds.push(contest.id);
    return contest;
  }

  async function createQuestion(title, extra) {
    const created = await request(app)
      .post('/admin/questions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload(title, extra))
      .expect(201);
    const question = created.body.data.question;
    createdQuestionIds.push(question.id);
    return question;
  }

  it('keeps seeded practice problems and drops the practice/contest exclusion trigger', async () => {
    const trigger = await query(
      `SELECT 1 FROM pg_proc WHERE proname = 'contest_questions_reject_practice'`,
    );
    assert.equal(trigger.rows.length, 0);
    const column = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'questions' AND column_name = 'archived_at'`,
    );
    assert.equal(column.rows.length, 1);
    const seeds = await query(
      `SELECT title FROM questions
       WHERE is_practice = TRUE AND is_development_seed = TRUE AND archived_at IS NULL
       ORDER BY sort_order ASC, title ASC`,
    );
    assert.deepEqual(
      seeds.rows.map((row) => row.title),
      ['Hello CodeArena', 'Sum of Two Numbers', 'Reverse String'],
    );
  });

  it('creates an unassigned question and finds it by search, difficulty, and assignment', async () => {
    const title = `Unassigned Bank ${Date.now()}`;
    const question = await createQuestion(title);
    assert.equal(question.assignment, 'unassigned');
    assert.equal(question.isPractice, false);
    assert.equal(question.contestCount, 0);
    assert.equal(question.languages.length, 4);
    assert.equal(question.testCases.some((testCase) => testCase.isHidden && testCase.expectedOutput === 'secret-bank'), true);

    const found = await request(app)
      .get('/admin/questions')
      .query({ q: 'token-bank-search', difficulty: 'hard', assignment: 'unassigned', page: 1, pageSize: 1 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(found.body.data.pagination.pageSize, 1);
    assert.ok(found.body.data.pagination.total >= 1);
    assert.equal(found.body.data.questions.length, 1);
    assert.equal(found.body.data.questions[0].testCases.some((testCase) => testCase.isHidden), true);

    await request(app)
      .get('/admin/questions')
      .query({ assignment: 'nope' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
    await request(app)
      .get('/admin/questions')
      .query({ q: title })
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
  });

  it('assigns one question to practice and multiple contests without duplicating it', async () => {
    const contestA = await createDraft('A');
    const contestB = await createDraft('B');
    const question = await createQuestion(`Shared Bank ${Date.now()}`, {
      includeInPractice: true,
      contestIds: [contestA.id, contestB.id],
    });
    assert.equal(question.assignment, 'both');
    assert.equal(question.isPractice, true);
    assert.equal(question.contests.length, 2);

    const rows = await query(
      'SELECT COUNT(*)::int AS n FROM questions WHERE title = $1',
      [question.title],
    );
    assert.equal(rows.rows[0].n, 1);
    const links = await query(
      'SELECT COUNT(*)::int AS n FROM contest_questions WHERE question_id = $1',
      [question.id],
    );
    assert.equal(links.rows[0].n, 2);

    const again = await request(app)
      .post('/admin/questions/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'assign-contests',
        questionIds: [question.id],
        contestIds: [contestA.id, contestB.id],
      })
      .expect(200);
    assert.equal(again.body.data.summary.alreadyAssigned.length, 2);
    const still = await query(
      'SELECT COUNT(*)::int AS n FROM contest_questions WHERE question_id = $1',
      [question.id],
    );
    assert.equal(still.rows[0].n, 2);

    const contestC = await createDraft('C');
    const [first, second] = await Promise.all([
      request(app)
        .post(`/admin/contests/${contestC.id}/questions/${question.id}`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app)
        .post(`/admin/contests/${contestC.id}/questions/${question.id}`)
        .set('Authorization', `Bearer ${adminToken}`),
    ]);
    assert.deepEqual([first.status, second.status].sort(), [200, 409]);
    const raced = await query(
      'SELECT COUNT(*)::int AS n FROM contest_questions WHERE question_id = $1 AND contest_id = $2',
      [question.id, contestC.id],
    );
    assert.equal(raced.rows[0].n, 1);
    await request(app)
      .delete(`/admin/contests/${contestC.id}/questions/${question.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const practice = await request(app)
      .get('/student/practice/problems')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const problem = practice.body.data.problems.find((item) => item.id === question.id);
    assert.ok(problem);
    assert.equal(problem.isPractice, undefined);
    assert.equal(problem.languages, undefined);
    assert.equal(problem.testCases.every((testCase) => testCase.isHidden === false), true);
    assert.equal(problem.testCases.some((testCase) => testCase.expectedOutput === 'secret-bank'), false);

    const removedPractice = await request(app)
      .post('/admin/questions/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'remove-practice', questionIds: [question.id] })
      .expect(200);
    assert.equal(removedPractice.body.data.questions[0].isPractice, false);
    assert.equal(removedPractice.body.data.questions[0].assignment, 'contest');
    const linksAfter = await query(
      'SELECT COUNT(*)::int AS n FROM contest_questions WHERE question_id = $1',
      [question.id],
    );
    assert.equal(linksAfter.rows[0].n, 2);

    await request(app)
      .post('/admin/questions/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'add-practice', questionIds: [question.id] })
      .expect(200);
    const linksRestored = await query(
      'SELECT COUNT(*)::int AS n FROM contest_questions WHERE question_id = $1',
      [question.id],
    );
    assert.equal(linksRestored.rows[0].n, 2);

    await request(app)
      .delete(`/admin/contests/${contestB.id}/questions/${question.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const remaining = await query(
      'SELECT contest_id FROM contest_questions WHERE question_id = $1',
      [question.id],
    );
    assert.deepEqual(remaining.rows.map((row) => row.contest_id), [contestA.id]);
    const stillPractice = await query('SELECT is_practice FROM questions WHERE id = $1', [question.id]);
    assert.equal(stillPractice.rows[0].is_practice, true);

    const filtered = await request(app)
      .get('/admin/questions')
      .query({ q: question.title, assignment: 'both' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(filtered.body.data.questions.some((item) => item.id === question.id), true);

    clock.setNow(T0);
    await request(app)
      .post(`/admin/contests/${contestA.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    await request(app)
      .post(`/student/contests/${contestA.id}/register`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
    clock.setNow(MID);
    const contestQuestions = await request(app)
      .get(`/student/contests/${contestA.id}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const visible = contestQuestions.body.data.questions.find((item) => item.id === question.id);
    assert.ok(visible);
    assert.equal(visible.isPractice, undefined);
    assert.equal(visible.testCases.every((testCase) => testCase.isHidden === false), true);
    assert.equal(visible.testCases.some((testCase) => testCase.expectedOutput === 'secret-bank'), false);
  });

  it('rejects student and malformed management requests', async () => {
    const question = await createQuestion(`Guarded Bank ${Date.now()}`);
    await request(app)
      .post('/admin/questions/bulk')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ action: 'add-practice', questionIds: [question.id] })
      .expect(403);
    await request(app)
      .post('/admin/questions/bulk')
      .send({ action: 'add-practice', questionIds: [question.id] })
      .expect(401);
    await request(app)
      .post('/admin/questions/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'nope', questionIds: [question.id] })
      .expect(400);
    await request(app)
      .delete(`/admin/questions/${question.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
    await request(app)
      .post(`/admin/questions/${question.id}/archive`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(403);
    await request(app)
      .patch(`/admin/questions/${question.id}/placement`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ includeInPractice: 'yes' })
      .expect(400);

    const deleted = await request(app)
      .delete(`/admin/questions/${question.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(deleted.body.data.question.deleted, true);
    const gone = await query('SELECT id FROM questions WHERE id = $1', [question.id]);
    assert.equal(gone.rows.length, 0);
    const cases = await query('SELECT id FROM question_test_cases WHERE question_id = $1', [question.id]);
    assert.equal(cases.rows.length, 0);
  });

  it('archives instead of deleting when submissions exist and preserves other assignments', async () => {
    const contestA = await createDraft('HistA');
    const contestB = await createDraft('HistB');
    const question = await createQuestion(`History Bank ${Date.now()}`, {
      includeInPractice: true,
      contestIds: [contestA.id, contestB.id],
    });
    await query(
      `INSERT INTO submissions (
         user_id, contest_id, question_id, language_slug, language_id,
         source_code, kind, status, tests_total
       ) VALUES ($1, $2, $3, 'python', 71, 'print(1)', 'submit', 'ACCEPTED', 1)`,
      [studentId, contestA.id, question.id],
    );

    const blocked = await request(app)
      .delete(`/admin/questions/${question.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    assert.equal(blocked.body.code, 'QUESTION_HAS_HISTORY');
    const stillThere = await query('SELECT id FROM questions WHERE id = $1', [question.id]);
    assert.equal(stillThere.rows.length, 1);

    const bulkBlocked = await request(app)
      .post('/admin/questions/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        action: 'unassign-contests',
        questionIds: [question.id],
        contestIds: [contestA.id, contestB.id],
      })
      .expect(409);
    assert.equal(bulkBlocked.body.code, 'CONTEST_QUESTION_HAS_HISTORY');
    const bothLinks = await query(
      'SELECT COUNT(*)::int AS n FROM contest_questions WHERE question_id = $1',
      [question.id],
    );
    assert.equal(bothLinks.rows[0].n, 2);

    const detachBlocked = await request(app)
      .delete(`/admin/contests/${contestA.id}/questions/${question.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    assert.match(detachBlocked.body.message, /submissions/i);

    const archived = await request(app)
      .post(`/admin/questions/${question.id}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(archived.body.data.question.archived, true);
    assert.equal(archived.body.data.question.isPractice, false);
    assert.deepEqual(archived.body.data.retainedContestIds, [contestA.id]);
    assert.deepEqual(archived.body.data.removedContestIds, [contestB.id]);

    const submission = await query(
      'SELECT id FROM submissions WHERE question_id = $1 AND contest_id = $2',
      [question.id, contestA.id],
    );
    assert.equal(submission.rows.length, 1);
    const practice = await request(app)
      .get('/student/practice/problems')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(practice.body.data.problems.some((item) => item.id === question.id), false);
    const seeds = await query(
      `SELECT COUNT(*)::int AS n FROM questions
       WHERE is_practice = TRUE AND is_development_seed = TRUE AND archived_at IS NULL`,
    );
    assert.equal(seeds.rows[0].n, 3);
  });
});
