const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { requirePostgres, uniqueEmail, restoreOpenEndedTestContest } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const { runMigrations } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');
const dispatcher = require('../../src/realtime/dispatcher');
const submissionRepository = require('../../src/repositories/submission.repository');
const { ROLES } = require('../../src/auth/roles');

const ADMIN_EMAIL = 'admin@codearena.com';
const ADMIN_PASSWORD = 'Admin@123';
const STUDENT_PASSWORD = 'student-pass';

describe('M11 amendments (PostgreSQL)', () => {
  let app;
  let adminToken;
  const emails = [];
  const contestIds = [];

  before(async () => {
    await requirePostgres();
    await runMigrations();
    await restoreOpenEndedTestContest();
    app = createApp();
    adminToken = (await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200)).body.data.token;
  });

  after(async () => {
    for (const id of contestIds) {
      await query('DELETE FROM contests WHERE id = $1', [id]).catch(() => {});
    }
    for (const email of emails) {
      await query('DELETE FROM users WHERE email = $1', [email]).catch(() => {});
    }
    await closePool();
  });

  async function registerStudent(label) {
    const email = uniqueEmail(label);
    emails.push(email);
    await request(app).post('/auth/register').send({ email, password: STUDENT_PASSWORD }).expect(201);
    const login = await request(app)
      .post('/auth/login')
      .send({ email, password: STUDENT_PASSWORD })
      .expect(200);
    return {
      email,
      token: login.body.data.token,
      userId: login.body.data.user.id,
    };
  }

  async function createRunningContest() {
    const start = new Date(Date.now() - 60 * 1000).toISOString();
    const created = await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `M11 amend ${Date.now()}`,
        description: 'exit readd resume',
        startTime: start,
        durationMinutes: 60,
      })
      .expect(201);
    const contest = created.body.data.contest;
    contestIds.push(contest.id);
    await request(app)
      .post(`/admin/contests/${contest.id}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const question = (await request(app)
      .post(`/admin/contests/${contest.id}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Keep history',
        description: 'history',
        difficulty: 'easy',
        testCases: [{ stdin: '1', expectedOutput: '1', isHidden: false, points: 10 }],
      })
      .expect(201)).body.data.question;
    return { contestId: contest.id, questionId: question.id };
  }

  it('lets a student exit, blocks re-entry, and lets an admin re-add without duplicating history', { timeout: 60_000 }, async () => {
    const { contestId, questionId } = await createRunningContest();
    const student = await registerStudent('m11-exit');
    const other = await registerStudent('m11-other');
    const events = [];
    const unsubscribe = dispatcher.subscribe((item) => {
      if (item?.envelope?.contestId === contestId) events.push(item.envelope);
    });

    try {
      await request(app)
        .post(`/student/contests/${contestId}/register`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({})
        .expect(201);
      await request(app)
        .post(`/student/contests/${contestId}/register`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({})
        .expect(201);

      const entered = await request(app)
        .post(`/student/contests/${contestId}/enter`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({})
        .expect(200);
      const participantId = entered.body.data.session.participantId;
      assert.equal(entered.body.data.session.status, 'started');

      const otherEntered = await request(app)
        .post(`/student/contests/${contestId}/enter`)
        .set('Authorization', `Bearer ${other.token}`)
        .send({})
        .expect(200);

      await request(app)
        .post(`/student/contests/${contestId}/current-question`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({ questionId })
        .expect(200);
      await request(app)
        .post(`/student/contests/${contestId}/violations`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({ type: 'TAB_SWITCH' })
        .expect(201);

      await query(
        'UPDATE contest_participants SET score = 15, penalty = 20 WHERE id = $1',
        [participantId],
      );
      await submissionRepository.create({
        userId: student.userId,
        contestId,
        participantId,
        questionId,
        languageSlug: 'python',
        languageId: 71,
        sourceCode: 'print(1)',
        kind: 'submit',
        testsTotal: 1,
      });

      const exited = await request(app)
        .post(`/student/contests/${contestId}/exit`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({})
        .expect(200);
      assert.equal(exited.body.data.session.status, 'exited');
      assert.equal(exited.body.data.session.score, 15);
      assert.equal(exited.body.data.session.penalty, 20);
      assert.ok(exited.body.data.session.exitedAt);

      const stored = await query(
        `SELECT status, score, penalty, exited_at, readd_count,
                (SELECT COUNT(*)::int FROM submissions s WHERE s.participant_id = p.id) AS submission_count,
                (SELECT COUNT(*)::int FROM contest_violations v WHERE v.participant_id = p.id) AS violation_count,
                (SELECT COUNT(*)::int FROM contest_participants c WHERE c.contest_id = p.contest_id AND c.user_id = p.user_id) AS row_count
         FROM contest_participants p WHERE p.id = $1`,
        [participantId],
      );
      assert.equal(stored.rows[0].status, 'exited');
      assert.equal(Number(stored.rows[0].score), 15);
      assert.equal(Number(stored.rows[0].penalty), 20);
      assert.ok(stored.rows[0].exited_at);
      assert.equal(Number(stored.rows[0].submission_count), 1);
      assert.equal(Number(stored.rows[0].violation_count), 1);
      assert.equal(Number(stored.rows[0].row_count), 1);

      const reenter = await request(app)
        .post(`/student/contests/${contestId}/enter`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({})
        .expect(403);
      assert.equal(reenter.body.code, 'SESSION_ENDED');

      const submit = await request(app)
        .post('/student/executions')
        .set('Authorization', `Bearer ${student.token}`)
        .send({
          contestId,
          questionId,
          language: 'python',
          sourceCode: 'print(1)',
          kind: 'submit',
        })
        .expect(409);
      assert.equal(submit.body.code, 'SESSION_ENDED');

      const adminView = await request(app)
        .get(`/admin/contests/${contestId}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const exitedRow = adminView.body.data.participants.find((row) => row.id === participantId);
      assert.equal(exitedRow.status, 'exited');
      assert.equal(exitedRow.score, 15);

      const studentReadd = await request(app)
        .post(`/admin/contests/${contestId}/participants/${participantId}/re-add`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({})
        .expect(403);
      assert.equal(studentReadd.body.code, 'FORBIDDEN');

      const removed = await request(app)
        .post(`/admin/contests/${contestId}/participants/${otherEntered.body.data.session.participantId}/remove`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);
      assert.equal(removed.body.data.participant.status, 'removed');
      const removedReadd = await request(app)
        .post(`/admin/contests/${contestId}/participants/${otherEntered.body.data.session.participantId}/re-add`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(409);
      assert.equal(removedReadd.body.code, 'PARTICIPANT_NOT_ELIGIBLE');

      const readded = await request(app)
        .post(`/admin/contests/${contestId}/participants/${participantId}/re-add`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);
      assert.equal(readded.body.data.participant.status, 'started');
      assert.equal(readded.body.data.participant.score, 15);
      assert.equal(readded.body.data.participant.penalty, 20);
      assert.equal(readded.body.data.participant.readdCount, 1);
      assert.ok(readded.body.data.participant.exitedAt);

      const after = await query(
        `SELECT status, score, penalty, exited_at, readd_count,
                (SELECT COUNT(*)::int FROM submissions s WHERE s.participant_id = p.id) AS submission_count,
                (SELECT COUNT(*)::int FROM contest_violations v WHERE v.participant_id = p.id) AS violation_count,
                (SELECT COUNT(*)::int FROM participant_question_states q WHERE q.participant_id = p.id AND q.invalidated) AS invalidated_count,
                (SELECT COUNT(*)::int FROM contest_participants c WHERE c.contest_id = p.contest_id AND c.user_id = p.user_id) AS row_count
         FROM contest_participants p WHERE p.id = $1`,
        [participantId],
      );
      assert.equal(after.rows[0].status, 'started');
      assert.equal(Number(after.rows[0].score), 15);
      assert.equal(Number(after.rows[0].penalty), 20);
      assert.ok(after.rows[0].exited_at);
      assert.equal(Number(after.rows[0].readd_count), 1);
      assert.equal(Number(after.rows[0].submission_count), 1);
      assert.equal(Number(after.rows[0].violation_count), 1);
      assert.equal(Number(after.rows[0].invalidated_count), 1);
      assert.equal(Number(after.rows[0].row_count), 1);

      const again = await request(app)
        .post(`/student/contests/${contestId}/enter`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({})
        .expect(200);
      assert.equal(again.body.data.session.status, 'started');
      assert.equal(again.body.data.session.score, 15);
      assert.ok(again.body.data.session.invalidatedQuestionIds.includes(questionId));

      assert.ok(events.some((event) => (
        event.type === 'participant.status.updated' && event.payload.status === 'exited'
      )));
      assert.ok(events.some((event) => (
        event.type === 'contest.session.invalidated' && event.payload.reason === 'SESSION_ENDED'
      )));
      assert.ok(events.some((event) => (
        event.type === 'participant.status.updated'
        && event.payload.status === 'started'
        && event.payload.readdCount === 1
      )));
    } finally {
      unsubscribe();
    }
  });

  it('resumes an ended contest without restoring exited or removed students or scores', { timeout: 60_000 }, async () => {
    const { contestId, questionId } = await createRunningContest();
    const active = await registerStudent('m11-active');
    const exitedStudent = await registerStudent('m11-stay-exited');
    const removedStudent = await registerStudent('m11-stay-removed');
    const events = [];
    const unsubscribe = dispatcher.subscribe((item) => {
      if (item?.envelope?.contestId === contestId) events.push(item.envelope);
    });

    try {
      for (const person of [active, exitedStudent, removedStudent]) {
        await request(app)
          .post(`/student/contests/${contestId}/register`)
          .set('Authorization', `Bearer ${person.token}`)
          .send({})
          .expect(201);
        await request(app)
          .post(`/student/contests/${contestId}/enter`)
          .set('Authorization', `Bearer ${person.token}`)
          .send({})
          .expect(200);
      }

      const participants = (await request(app)
        .get(`/admin/contests/${contestId}/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)).body.data.participants;
      const activeRow = participants.find((row) => row.userId === active.userId);
      const exitedRow = participants.find((row) => row.userId === exitedStudent.userId);
      const removedRow = participants.find((row) => row.userId === removedStudent.userId);
      await query('UPDATE contest_participants SET score = 12, penalty = 5 WHERE id = $1', [activeRow.id]);
      await submissionRepository.create({
        userId: active.userId,
        contestId,
        participantId: activeRow.id,
        questionId,
        languageSlug: 'python',
        languageId: 71,
        sourceCode: 'print(1)',
        kind: 'submit',
        testsTotal: 1,
      });

      await request(app)
        .post(`/student/contests/${contestId}/violations`)
        .set('Authorization', `Bearer ${active.token}`)
        .send({ type: 'TAB_SWITCH' })
        .expect(201);

      await request(app)
        .post(`/student/contests/${contestId}/exit`)
        .set('Authorization', `Bearer ${exitedStudent.token}`)
        .send({})
        .expect(200);
      const exitedDeadline = (await query(
        'SELECT effective_deadline FROM contest_participants WHERE id = $1',
        [exitedRow.id],
      )).rows[0].effective_deadline;

      await request(app)
        .post(`/admin/contests/${contestId}/participants/${removedRow.id}/remove`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);

      const ended = await request(app)
        .post(`/admin/contests/${contestId}/end`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);
      assert.equal(ended.body.data.contest.status, 'ended');
      assert.ok(ended.body.data.contest.allowedActions.includes('resume'));

      const blocked = await request(app)
        .post(`/student/contests/${contestId}/enter`)
        .set('Authorization', `Bearer ${active.token}`)
        .send({})
        .expect(403);
      assert.equal(blocked.body.code, 'CONTEST_ENDED');

      const studentResume = await request(app)
        .post(`/admin/contests/${contestId}/resume`)
        .set('Authorization', `Bearer ${active.token}`)
        .send({ extendMinutes: 25 })
        .expect(403);
      assert.equal(studentResume.body.code, 'FORBIDDEN');

      const missingWindow = await request(app)
        .post(`/admin/contests/${contestId}/resume`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(400);
      assert.equal(missingWindow.body.code, 'VALIDATION_ERROR');

      const resumed = await request(app)
        .post(`/admin/contests/${contestId}/resume`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ extendMinutes: 25 })
        .expect(200);
      assert.equal(resumed.body.data.contest.status, 'running');
      assert.ok(resumed.body.data.contest.resumedAt);
      const newEnd = Date.parse(resumed.body.data.contest.endTime);
      assert.ok(newEnd > Date.now());
      assert.equal(resumed.body.data.contest.durationMinutes, 60);

      const rows = await query(
        `SELECT id, status, score, penalty, effective_deadline, exited_at
         FROM contest_participants WHERE contest_id = $1`,
        [contestId],
      );
      const byId = new Map(rows.rows.map((row) => [row.id, row]));
      assert.equal(byId.get(exitedRow.id).status, 'exited');
      assert.equal(
        new Date(byId.get(exitedRow.id).effective_deadline).toISOString(),
        new Date(exitedDeadline).toISOString(),
      );
      assert.equal(byId.get(removedRow.id).status, 'removed');
      assert.equal(Number(byId.get(activeRow.id).score), 12);
      assert.equal(Number(byId.get(activeRow.id).penalty), 5);
      assert.equal(
        new Date(byId.get(activeRow.id).effective_deadline).toISOString(),
        new Date(resumed.body.data.contest.endTime).toISOString(),
      );

      const continued = await request(app)
        .post(`/student/contests/${contestId}/enter`)
        .set('Authorization', `Bearer ${active.token}`)
        .send({})
        .expect(200);
      assert.equal(continued.body.data.session.score, 12);
      assert.equal(
        new Date(continued.body.data.session.effectiveDeadline).toISOString(),
        new Date(resumed.body.data.contest.endTime).toISOString(),
      );

      const stillExited = await request(app)
        .post(`/student/contests/${contestId}/enter`)
        .set('Authorization', `Bearer ${exitedStudent.token}`)
        .send({})
        .expect(403);
      assert.equal(stillExited.body.code, 'SESSION_ENDED');
      const stillRemoved = await request(app)
        .post(`/student/contests/${contestId}/enter`)
        .set('Authorization', `Bearer ${removedStudent.token}`)
        .send({})
        .expect(403);
      assert.equal(stillRemoved.body.code, 'PARTICIPANT_REMOVED');

      const submissionCount = await query(
        'SELECT COUNT(*)::int AS count FROM submissions WHERE contest_id = $1 AND question_id = $2',
        [contestId, questionId],
      );
      assert.equal(Number(submissionCount.rows[0].count), 1);
      const violationCount = await query(
        'SELECT COUNT(*)::int AS count FROM contest_violations WHERE contest_id = $1',
        [contestId],
      );
      assert.equal(Number(violationCount.rows[0].count), 1);

      assert.ok(events.some((event) => event.type === 'contest.ended'));
      assert.ok(events.some((event) => (
        event.type === 'contest.started' && event.payload.status === 'running'
      )));

      const resumeAgain = await request(app)
        .post(`/admin/contests/${contestId}/resume`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ extendMinutes: 10 })
        .expect(409);
      assert.equal(resumeAgain.body.code, 'INVALID_TRANSITION');
    } finally {
      unsubscribe();
    }
  });

  it('registers only students and enforces the existing auth contract', async () => {
    const email = uniqueEmail('m11-register');
    emails.push(email);

    const invalidEmail = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: STUDENT_PASSWORD })
      .expect(400);
    assert.equal(invalidEmail.body.code, 'VALIDATION_ERROR');

    const invalidPassword = await request(app)
      .post('/auth/register')
      .send({ email, password: 'short' })
      .expect(400);
    assert.equal(invalidPassword.body.code, 'VALIDATION_ERROR');
    assert.match(invalidPassword.body.errors[0].message, /at least 8/);

    const created = await request(app)
      .post('/auth/register')
      .send({ email, password: STUDENT_PASSWORD, role: ROLES.ADMIN })
      .expect(201);
    assert.equal(created.body.data.user.role, ROLES.STUDENT);

    const duplicate = await request(app)
      .post('/auth/register')
      .send({ email, password: STUDENT_PASSWORD })
      .expect(409);
    assert.equal(duplicate.body.code, 'EMAIL_TAKEN');

    const login = await request(app)
      .post('/auth/login')
      .send({ email, password: STUDENT_PASSWORD })
      .expect(200);
    const token = login.body.data.token;

    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    assert.equal(me.body.data.user.role, ROLES.STUDENT);
    assert.equal(me.body.data.user.email, email);

    await request(app)
      .get('/student/contests')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const adminDenied = await request(app)
      .get('/admin/contests')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    assert.equal(adminDenied.body.code, 'FORBIDDEN');

    const stored = await query('SELECT role FROM users WHERE email = $1', [email]);
    assert.equal(stored.rows[0].role, ROLES.STUDENT);
  });

  it('rejects resume unless an admin sends a future window for an ended contest', { timeout: 60_000 }, async () => {
    const { contestId } = await createRunningContest();
    const student = await registerStudent('m11-resume-auth');

    const unauthenticated = await request(app)
      .post(`/admin/contests/${contestId}/resume`)
      .send({ extendMinutes: 10 })
      .expect(401);
    assert.equal(unauthenticated.body.code, 'UNAUTHENTICATED');

    await request(app)
      .post(`/admin/contests/${contestId}/end`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    const zero = await request(app)
      .post(`/admin/contests/${contestId}/resume`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ extendMinutes: 0 })
      .expect(400);
    assert.equal(zero.body.code, 'VALIDATION_ERROR');

    const past = await request(app)
      .post(`/admin/contests/${contestId}/resume`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ endTime: new Date(Date.now() - 60_000).toISOString() })
      .expect(400);
    assert.equal(past.body.code, 'VALIDATION_ERROR');

    const cancelled = await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `M11 cancelled ${Date.now()}`,
        description: 'cannot resume',
        startTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
      })
      .expect(201);
    const cancelledId = cancelled.body.data.contest.id;
    contestIds.push(cancelledId);
    await request(app)
      .post(`/admin/contests/${cancelledId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const cancelledResume = await request(app)
      .post(`/admin/contests/${cancelledId}/resume`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ extendMinutes: 15 })
      .expect(409);
    assert.equal(cancelledResume.body.code, 'INVALID_TRANSITION');

    const studentResume = await request(app)
      .post(`/admin/contests/${contestId}/resume`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ extendMinutes: 15 })
      .expect(403);
    assert.equal(studentResume.body.code, 'FORBIDDEN');
  });
});
