const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { requirePostgres, uniqueEmail, restoreOpenEndedTestContest } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const { runMigrations } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');
const { applyExecutionResult } = require('../../src/submissions/submission.service');

const ADMIN_EMAIL = 'admin@codearena.com';
const ADMIN_PASSWORD = 'Admin@123';
const STUDENT_PASSWORD = 'student-pass';

describe('Practice APIs (PostgreSQL)', () => {
  let app;
  let studentEmail;
  let studentToken;
  let problemId;

  before(async () => {
    await requirePostgres();
    await runMigrations();
    await restoreOpenEndedTestContest();
    app = createApp();
    studentEmail = uniqueEmail('practice-student');

    await request(app)
      .post('/auth/register')
      .send({ email: studentEmail, password: STUDENT_PASSWORD })
      .expect(201);

    const studentLogin = await request(app)
      .post('/auth/login')
      .send({ email: studentEmail, password: STUDENT_PASSWORD })
      .expect(200);
    studentToken = studentLogin.body.data.token;
  });

  after(async () => {
    if (studentEmail) {
      await query('DELETE FROM users WHERE email = $1', [studentEmail]).catch(() => {});
    }
    await closePool();
  });

  it('seeds practice problems independently of the Test contest', async () => {
    const practice = await query(
      `SELECT title FROM questions
       WHERE is_practice = TRUE AND is_development_seed = TRUE
       ORDER BY sort_order ASC, title ASC`,
    );
    const titles = practice.rows.map((row) => row.title);
    assert.deepEqual(titles, ['Hello CodeArena', 'Sum of Two Numbers', 'Reverse String']);

    const contestQuestions = await query(
      `SELECT q.title
       FROM questions q
       INNER JOIN contest_questions cq ON cq.question_id = q.id
       INNER JOIN contests c ON c.id = cq.contest_id
       WHERE c.is_development_seed = TRUE AND c.title = 'Test' AND q.is_practice = FALSE`,
    );
    const contestTitles = contestQuestions.rows.map((row) => row.title);
    assert.ok(contestTitles.includes('Hello World'));
    assert.ok(contestTitles.includes('Sum of Two Numbers'));
    assert.ok(contestTitles.includes('Reverse String'));

    const second = await runMigrations();
    assert.ok(second.skipped.includes('008'));
    const after = await query(
      `SELECT COUNT(*)::int AS n FROM questions WHERE is_practice = TRUE AND is_development_seed = TRUE`,
    );
    assert.equal(after.rows[0].n, 3);
  });

  it('rejects unauthenticated and admin access to practice endpoints', async () => {
    await request(app).get('/student/practice/problems').expect(401);

    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    await request(app)
      .get('/student/practice/problems')
      .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
      .expect(403);
  });

  it('lets a student list and open practice problems without a contest', async () => {
    const list = await request(app)
      .get('/student/practice/problems')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    assert.equal(list.body.success, true);
    const problems = list.body.data.problems;
    assert.equal(problems.length, 3);
    assert.equal(problems[0].contestId, undefined);
    assert.equal(problems[0].isPractice, undefined);
    assert.equal(problems[0].sampleOutput, 'Hello CodeArena');
    assert.equal(
      problems.every((problem) => problem.testCases.every((testCase) => testCase.isHidden === false)),
      true,
    );
    assert.equal(problems[0].testCases.length, 1);

    problemId = problems[0].id;
    const detail = await request(app)
      .get(`/student/practice/problems/${problemId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(detail.body.data.problem.title, 'Hello CodeArena');
    assert.equal(detail.body.data.problem.contestId, undefined);
  });

  it('does not expose practice problems as student contest questions', async () => {
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

    const questions = await request(app)
      .get(`/student/contests/${testContest.id}/questions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    const expectedCount = await query(
      `SELECT COUNT(*)::int AS n
       FROM contest_questions cq
       INNER JOIN questions q ON q.id = cq.question_id
       WHERE cq.contest_id = $1 AND q.is_practice = FALSE`,
      [testContest.id],
    );
    assert.equal(questions.body.data.questions.length, expectedCount.rows[0].n);
    assert.ok(questions.body.data.questions.length >= 3);
    assert.equal(
      questions.body.data.questions.every((question) => question.id !== problemId),
      true,
    );
    assert.equal(
      questions.body.data.questions.every((question) => question.isPractice !== true),
      true,
    );
  });

  it('returns 503 when the practice execution queue is not connected', async () => {
    await request(app)
      .post('/student/practice/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        questionId: problemId,
        language: 'python',
        sourceCode: 'print("Hello CodeArena")',
        kind: 'run',
      })
      .expect(503);
  });

  it('persists a practice submission and applies an execution result', async () => {
    const userRow = await query('SELECT id FROM users WHERE email = $1', [studentEmail]);
    const inserted = await query(
      `INSERT INTO submissions (
         user_id, contest_id, question_id, language_slug, language_id,
         source_code, kind, status, tests_total
       ) VALUES ($1, NULL, $2, 'python', 71, 'print(1)', 'run', 'QUEUED', 1)
       RETURNING id, contest_id, status`,
      [userRow.rows[0].id, problemId],
    );
    assert.equal(inserted.rows[0].contest_id, null);
    assert.equal(inserted.rows[0].status, 'QUEUED');
    const submissionId = inserted.rows[0].id;

    const updated = await applyExecutionResult({
      jobId: submissionId,
      status: 'ACCEPTED',
      stdout: 'Hello CodeArena',
      stderr: null,
      compileOutput: null,
      message: null,
      exitCode: 0,
      time: '0.01',
      memory: 1024,
      token: 'tok-practice',
      testsPassed: 1,
      testsTotal: 1,
    });
    assert.equal(updated.status, 'ACCEPTED');
    assert.equal(updated.stdout, 'Hello CodeArena');
    assert.equal(updated.contestId, null);

    const fetched = await request(app)
      .get(`/student/practice/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.equal(fetched.body.data.submission.status, 'ACCEPTED');
    assert.equal(fetched.body.data.submission.sourceCode, undefined);
    assert.equal(fetched.body.data.submission.contestId, null);

    const listed = await request(app)
      .get('/student/practice/submissions')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    assert.ok(listed.body.data.submissions.some((row) => row.id === submissionId));
  });

  it('rejects contest executions against a practice problem', async () => {
    await request(app)
      .post('/student/executions')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        questionId: problemId,
        language: 'python',
        sourceCode: 'print("Hello CodeArena")',
        kind: 'run',
      })
      .expect(404);
  });
});
