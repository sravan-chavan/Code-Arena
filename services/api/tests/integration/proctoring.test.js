const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const request = require('supertest');
const { requirePostgres, uniqueEmail, restoreOpenEndedTestContest, applyTestRabbitEnv } = require('./helpers');
const { closePool } = require('../../src/db/pool');
const { query } = require('../../src/db/query');
const { runMigrations } = require('../../src/db/migrate');
const { createApp } = require('../../src/app');
const dispatcher = require('../../src/realtime/dispatcher');
const { applyExecutionResult } = require('../../src/submissions/submission.service');
const { initMessaging, closeMessaging } = require('../../src/messaging');

const ADMIN_EMAIL = 'admin@codearena.com';
const ADMIN_PASSWORD = 'Admin@123';
const STUDENT_PASSWORD = 'student-pass';

describe('Arena proctoring (PostgreSQL)', () => {
  let app;
  let adminToken;
  let messagingOpened = false;
  const emails = [];
  const contestIds = [];

  before(async () => {
    await requirePostgres();
    applyTestRabbitEnv();
    await runMigrations();
    await restoreOpenEndedTestContest();
    app = createApp();
    adminToken = (await request(app)
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200)).body.data.token;
  });

  after(async () => {
    if (messagingOpened) {
      await closeMessaging().catch(() => {});
    }
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
    const created = await request(app)
      .post('/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Proctor ${Date.now()} ${randomUUID().slice(0, 8)}`,
        description: 'proctoring',
        startTime: new Date(Date.now() - 60_000).toISOString(),
        durationMinutes: 60,
      })
      .expect(201);
    const contestId = created.body.data.contest.id;
    contestIds.push(contestId);
    await request(app)
      .post(`/admin/contests/${contestId}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const kept = await addQuestion(contestId, 'Kept', [
      { stdin: '1', expectedOutput: '1', isHidden: false, points: 10 },
    ]);
    const watched = await addQuestion(contestId, 'Watched', [
      { stdin: '1', expectedOutput: '1', isHidden: false, points: 10 },
      { stdin: '2', expectedOutput: '2', isHidden: true, points: 20 },
    ]);
    return { contestId, keptId: kept.id, watchedId: watched.id };
  }

  async function addQuestion(contestId, title, testCases) {
    const response = await request(app)
      .post(`/admin/contests/${contestId}/questions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        description: title,
        difficulty: 'easy',
        testCases,
      })
      .expect(201);
    return response.body.data.question;
  }

  async function enter(token, contestId) {
    const response = await request(app)
      .post(`/student/contests/${contestId}/enter`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(200);
    return response.body.data.session;
  }

  async function join(token, contestId) {
    await request(app)
      .post(`/student/contests/${contestId}/register`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    return enter(token, contestId);
  }

  async function selectQuestion(token, contestId, questionId) {
    await request(app)
      .post(`/student/contests/${contestId}/current-question`)
      .set('Authorization', `Bearer ${token}`)
      .send({ questionId })
      .expect(200);
  }

  async function insertSubmission({ userId, contestId, participantId, questionId, kind }) {
    const result = await query(
      `INSERT INTO submissions (
         user_id, contest_id, participant_id, question_id, language_slug, language_id,
         source_code, kind, status, tests_total
       ) VALUES ($1, $2, $3, $4, 'python', 71, 'print(1)', $5, 'QUEUED', 2)
       RETURNING id`,
      [userId, contestId, participantId, questionId, kind],
    );
    return result.rows[0].id;
  }

  async function accept(jobId, earned) {
    await applyExecutionResult({
      jobId,
      status: 'ACCEPTED',
      testsPassed: 2,
      testsTotal: 2,
      score: earned,
      testResults: [
        {
          sortOrder: 0,
          isHidden: false,
          status: 'ACCEPTED',
          passed: true,
          points: 10,
          pointsEarned: Math.min(10, earned),
        },
        {
          sortOrder: 1,
          isHidden: true,
          status: 'ACCEPTED',
          passed: true,
          points: 20,
          pointsEarned: Math.max(earned - 10, 0),
        },
      ],
    });
  }

  async function participantScore(participantId) {
    const result = await query(
      `SELECT score, possible_score, tab_switch_count, status
       FROM contest_participants WHERE id = $1`,
      [participantId],
    );
    return result.rows[0];
  }

  async function ensureMessaging() {
    if (!messagingOpened) {
      await initMessaging({ serviceName: 'codearena-api-test' });
      messagingOpened = true;
    }
  }

  it('invalidates only the current question and ignores forged identity, runs, and late results', { timeout: 60_000 }, async () => {
    const { contestId, keptId, watchedId } = await createRunningContest();
    const scorer = await registerStudent('proctor-score');
    const rival = await registerStudent('proctor-rival');
    const attacker = await registerStudent('proctor-attacker');
    const events = [];
    const unsubscribe = dispatcher.subscribe((item) => {
      if (item?.envelope?.contestId === contestId) events.push(item.envelope);
    });

    try {
      const scorerSession = await join(scorer.token, contestId);
      const rivalSession = await join(rival.token, contestId);
      const attackerSession = await join(attacker.token, contestId);
      await selectQuestion(scorer.token, contestId, keptId);
      await selectQuestion(rival.token, contestId, keptId);
      await selectQuestion(attacker.token, contestId, keptId);

      await accept(await insertSubmission({
        userId: scorer.userId,
        contestId,
        participantId: scorerSession.participantId,
        questionId: keptId,
        kind: 'submit',
      }), 10);
      await accept(await insertSubmission({
        userId: scorer.userId,
        contestId,
        participantId: scorerSession.participantId,
        questionId: watchedId,
        kind: 'submit',
      }), 30);
      await accept(await insertSubmission({
        userId: rival.userId,
        contestId,
        participantId: rivalSession.participantId,
        questionId: keptId,
        kind: 'submit',
      }), 10);

      const beforeRun = await participantScore(scorerSession.participantId);
      assert.equal(Number(beforeRun.score), 40);
      assert.equal(Number(beforeRun.possible_score), 40);

      await accept(await insertSubmission({
        userId: scorer.userId,
        contestId,
        participantId: scorerSession.participantId,
        questionId: watchedId,
        kind: 'run',
      }), 99);
      const afterRun = await participantScore(scorerSession.participantId);
      assert.equal(Number(afterRun.score), 40);

      await ensureMessaging();
      const queuedRun = await request(app)
        .post('/student/executions')
        .set('Authorization', `Bearer ${rival.token}`)
        .send({
          contestId,
          questionId: keptId,
          language: 'python',
          sourceCode: 'print(1)',
          kind: 'run',
        })
        .expect(202);
      assert.equal(queuedRun.body.data.submission.kind, 'run');

      const forged = await request(app)
        .post(`/student/contests/${contestId}/violations`)
        .set('Authorization', `Bearer ${attacker.token}`)
        .send({
          type: 'TAB_SWITCH',
          source: 'visibilitychange',
          userId: scorer.userId,
          participantId: scorerSession.participantId,
          questionId: watchedId,
        })
        .expect(201);
      assert.equal(forged.body.data.session.participantId, attackerSession.participantId);
      assert.ok(forged.body.data.session.invalidatedQuestionIds.includes(keptId));
      assert.equal(forged.body.data.session.invalidatedQuestionIds.includes(watchedId), false);
      assert.equal(Number((await participantScore(scorerSession.participantId)).score), 40);
      assert.equal(Number((await participantScore(rivalSession.participantId)).score), 10);

      await selectQuestion(scorer.token, contestId, watchedId);
      const marker = events.length;
      const violation = await request(app)
        .post(`/student/contests/${contestId}/violations`)
        .set('Authorization', `Bearer ${scorer.token}`)
        .send({ type: 'TAB_SWITCH', source: 'fullscreenchange', blurObserved: true })
        .expect(201);
      assert.equal(violation.body.data.duplicate, false);
      assert.equal(violation.body.data.session.tabSwitchCount, 1);
      assert.ok(violation.body.data.session.invalidatedQuestionIds.includes(watchedId));
      assert.equal(violation.body.data.session.invalidatedQuestionIds.includes(keptId), false);
      assert.equal(violation.body.data.violation.metadata.source, 'fullscreenchange');
      assert.equal(violation.body.data.violation.metadata.blurObserved, true);

      const scored = await participantScore(scorerSession.participantId);
      assert.equal(Number(scored.score), 10);
      assert.equal(Number(scored.possible_score), 10);
      assert.equal(Number((await participantScore(rivalSession.participantId)).score), 10);

      const states = await query(
        `SELECT question_id, earned_points, possible_points, invalidated
         FROM participant_question_states WHERE participant_id = $1`,
        [scorerSession.participantId],
      );
      const byQuestion = new Map(states.rows.map((row) => [row.question_id, row]));
      assert.equal(byQuestion.get(keptId).invalidated, false);
      assert.equal(Number(byQuestion.get(keptId).earned_points), 10);
      assert.equal(byQuestion.get(watchedId).invalidated, true);
      assert.equal(Number(byQuestion.get(watchedId).earned_points), 0);

      await accept(await insertSubmission({
        userId: scorer.userId,
        contestId,
        participantId: scorerSession.participantId,
        questionId: watchedId,
        kind: 'submit',
      }), 30);
      const afterLate = await participantScore(scorerSession.participantId);
      assert.equal(Number(afterLate.score), 10);
      assert.equal(Number(afterLate.possible_score), 10);
      const watchedState = await query(
        `SELECT earned_points, invalidated FROM participant_question_states
         WHERE participant_id = $1 AND question_id = $2`,
        [scorerSession.participantId, watchedId],
      );
      assert.equal(watchedState.rows[0].invalidated, true);
      assert.equal(Number(watchedState.rows[0].earned_points), 0);

      const blockedSubmit = await request(app)
        .post('/student/executions')
        .set('Authorization', `Bearer ${scorer.token}`)
        .send({
          contestId,
          questionId: watchedId,
          language: 'python',
          sourceCode: 'print(1)',
          kind: 'submit',
        })
        .expect(409);
      assert.equal(blockedSubmit.body.code, 'QUESTION_INVALIDATED');
      const blockedRun = await request(app)
        .post('/student/executions')
        .set('Authorization', `Bearer ${scorer.token}`)
        .send({
          contestId,
          questionId: watchedId,
          language: 'python',
          sourceCode: 'print(1)',
          kind: 'run',
        })
        .expect(409);
      assert.equal(blockedRun.body.code, 'QUESTION_INVALIDATED');

      const keptRun = await request(app)
        .post('/student/executions')
        .set('Authorization', `Bearer ${scorer.token}`)
        .send({
          contestId,
          questionId: keptId,
          language: 'python',
          sourceCode: 'print(1)',
          kind: 'run',
        })
        .expect(202);
      assert.equal(keptRun.body.data.submission.kind, 'run');

      const ranking = await request(app)
        .get(`/student/contests/${contestId}/ranking`)
        .set('Authorization', `Bearer ${scorer.token}`)
        .expect(200);
      const stored = await query(
        'SELECT id, score FROM contest_participants WHERE contest_id = $1',
        [contestId],
      );
      for (const row of ranking.body.data.ranking) {
        const match = stored.rows.find((item) => item.id === row.participantId);
        assert.equal(row.score, Number(match.score));
      }
      const scorerRank = ranking.body.data.ranking.find((row) => row.participantId === scorerSession.participantId);
      const rivalRank = ranking.body.data.ranking.find((row) => row.participantId === rivalSession.participantId);
      assert.equal(scorerRank.score, 10);
      assert.equal(rivalRank.score, 10);

      const published = events.slice(marker);
      assert.ok(published.some((event) => event.type === 'contest.violation.detected'
        && event.payload.participantId === scorerSession.participantId
        && event.payload.questionId === watchedId
        && event.payload.tabSwitchCount === 1));
      assert.ok(published.some((event) => event.type === 'participant.score.updated'
        && event.payload.participantId === scorerSession.participantId
        && event.payload.score === 10));
      assert.ok(published.some((event) => event.type === 'contest.ranking.updated'));
    } finally {
      unsubscribe();
    }
  });

  it('records one violation when the same client event is delivered twice, including concurrently', { timeout: 60_000 }, async () => {
    const { contestId, watchedId } = await createRunningContest();
    const student = await registerStudent('proctor-dup');
    const session = await join(student.token, contestId);
    await selectQuestion(student.token, contestId, watchedId);
    const clientEventId = randomUUID();
    const [first, second] = await Promise.all([
      request(app)
        .post(`/student/contests/${contestId}/violations`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({ type: 'TAB_SWITCH', source: 'visibilitychange', clientEventId }),
      request(app)
        .post(`/student/contests/${contestId}/violations`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({ type: 'TAB_SWITCH', source: 'fullscreenchange', clientEventId }),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 201]);
    assert.equal([first, second].filter((item) => item.body.data.duplicate).length, 1);
    const once = await participantScore(session.participantId);
    assert.equal(Number(once.tab_switch_count), 1);
    const rows = await query(
      'SELECT COUNT(*)::int AS count FROM contest_violations WHERE participant_id = $1',
      [session.participantId],
    );
    assert.equal(rows.rows[0].count, 1);

    const again = await request(app)
      .post(`/student/contests/${contestId}/violations`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ type: 'TAB_SWITCH', clientEventId })
      .expect(200);
    assert.equal(again.body.data.duplicate, true);
    assert.equal(again.body.data.session.tabSwitchCount, 1);

    await request(app)
      .post(`/student/contests/${contestId}/violations`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ type: 'TAB_SWITCH', clientEventId: randomUUID() })
      .expect(201);
    const twice = await participantScore(session.participantId);
    assert.equal(Number(twice.tab_switch_count), 2);
  });

  it('rejects unauthorized, cross-role, and malformed violation reports', { timeout: 60_000 }, async () => {
    const { contestId } = await createRunningContest();
    const student = await registerStudent('proctor-auth');
    await join(student.token, contestId);

    await request(app)
      .post(`/student/contests/${contestId}/violations`)
      .send({ type: 'TAB_SWITCH' })
      .expect(401);
    const asAdmin = await request(app)
      .post(`/student/contests/${contestId}/violations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'TAB_SWITCH' })
      .expect(403);
    assert.equal(asAdmin.body.code, 'FORBIDDEN');
    await request(app)
      .post(`/student/contests/${contestId}/violations`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ type: 'EXIT' })
      .expect(400);
    await request(app)
      .post(`/student/contests/${contestId}/violations`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ type: 'TAB_SWITCH', source: 'blur' })
      .expect(400);
    await request(app)
      .post(`/student/contests/${contestId}/violations`)
      .set('Authorization', `Bearer ${student.token}`)
      .send({ type: 'TAB_SWITCH', clientEventId: 'not-a-uuid' })
      .expect(400);

    const count = await query(
      'SELECT COUNT(*)::int AS count FROM contest_violations WHERE contest_id = $1',
      [contestId],
    );
    assert.equal(count.rows[0].count, 0);
  });

  it('keeps a late result from restoring marks when it races a violation', { timeout: 60_000 }, async () => {
    const { contestId, watchedId } = await createRunningContest();
    const students = [];
    for (let index = 0; index < 4; index += 1) {
      const student = await registerStudent(`proctor-race-${index}`);
      const session = await join(student.token, contestId);
      await selectQuestion(student.token, contestId, watchedId);
      const jobId = await insertSubmission({
        userId: student.userId,
        contestId,
        participantId: session.participantId,
        questionId: watchedId,
        kind: 'submit',
      });
      students.push({ ...student, participantId: session.participantId, jobId });
    }

    await Promise.all(students.map(async (student) => {
      await Promise.all([
        accept(student.jobId, 30),
        request(app)
          .post(`/student/contests/${contestId}/violations`)
          .set('Authorization', `Bearer ${student.token}`)
          .send({ type: 'TAB_SWITCH', source: 'visibilitychange', clientEventId: randomUUID() })
          .expect(201),
      ]);
    }));

    for (const student of students) {
      const row = await participantScore(student.participantId);
      assert.equal(Number(row.score), 0);
      assert.equal(Number(row.possible_score), 10);
      const state = await query(
        `SELECT earned_points, invalidated FROM participant_question_states
         WHERE participant_id = $1 AND question_id = $2`,
        [student.participantId, watchedId],
      );
      assert.equal(state.rows[0].invalidated, true);
      assert.equal(Number(state.rows[0].earned_points), 0);
      await accept(await insertSubmission({
        userId: student.userId,
        contestId,
        participantId: student.participantId,
        questionId: watchedId,
        kind: 'submit',
      }), 30);
      const afterLate = await participantScore(student.participantId);
      assert.equal(Number(afterLate.score), 0);
    }
  });

  it('removes an exited student until an admin re-adds them', { timeout: 60_000 }, async () => {
    const { contestId, keptId } = await createRunningContest();
    const student = await registerStudent('proctor-exit');
    const events = [];
    const unsubscribe = dispatcher.subscribe((item) => {
      if (item?.envelope?.contestId === contestId) events.push(item.envelope);
    });

    try {
      const session = await join(student.token, contestId);
      await selectQuestion(student.token, contestId, keptId);
      await accept(await insertSubmission({
        userId: student.userId,
        contestId,
        participantId: session.participantId,
        questionId: keptId,
        kind: 'submit',
      }), 10);
      await request(app)
        .post(`/student/contests/${contestId}/violations`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({ type: 'TAB_SWITCH' })
        .expect(201);

      const exited = await request(app)
        .post(`/student/contests/${contestId}/exit`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({})
        .expect(200);
      assert.equal(exited.body.data.session.status, 'exited');
      assert.equal(exited.body.data.session.score, 0);

      const reenter = await request(app)
        .post(`/student/contests/${contestId}/enter`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({})
        .expect(403);
      assert.equal(reenter.body.code, 'SESSION_ENDED');
      const sessionRead = await request(app)
        .get(`/student/contests/${contestId}/session`)
        .set('Authorization', `Bearer ${student.token}`)
        .expect(403);
      assert.equal(sessionRead.body.code, 'SESSION_ENDED');
      const lateViolation = await request(app)
        .post(`/student/contests/${contestId}/violations`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({ type: 'TAB_SWITCH', clientEventId: randomUUID() })
        .expect(403);
      assert.equal(lateViolation.body.code, 'SESSION_ENDED');

      const studentReadd = await request(app)
        .post(`/admin/contests/${contestId}/participants/${session.participantId}/re-add`)
        .set('Authorization', `Bearer ${student.token}`)
        .send({})
        .expect(403);
      assert.equal(studentReadd.body.code, 'FORBIDDEN');

      const preserved = await query(
        `SELECT status, score,
                (SELECT COUNT(*)::int FROM submissions s WHERE s.participant_id = p.id) AS submission_count,
                (SELECT COUNT(*)::int FROM contest_violations v WHERE v.participant_id = p.id) AS violation_count
         FROM contest_participants p WHERE p.id = $1`,
        [session.participantId],
      );
      assert.equal(preserved.rows[0].status, 'exited');
      assert.equal(Number(preserved.rows[0].score), 0);
      assert.equal(preserved.rows[0].submission_count, 1);
      assert.equal(preserved.rows[0].violation_count, 1);

      const readded = await request(app)
        .post(`/admin/contests/${contestId}/participants/${session.participantId}/re-add`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({})
        .expect(200);
      assert.equal(readded.body.data.participant.status, 'started');
      assert.equal(readded.body.data.participant.readdCount, 1);
      assert.equal(readded.body.data.participant.score, 0);
      assert.ok(readded.body.data.participant.exitedAt);

      const again = await enter(student.token, contestId);
      assert.equal(again.status, 'started');
      assert.ok(again.invalidatedQuestionIds.includes(keptId));
      assert.equal(again.score, 0);
      assert.ok(events.some((event) => event.type === 'participant.status.updated' && event.payload.status === 'exited'));
      assert.ok(events.some((event) => event.type === 'contest.session.invalidated' && event.payload.reason === 'SESSION_ENDED'));
      assert.ok(events.some((event) => (
        event.type === 'participant.status.updated'
        && event.payload.status === 'started'
        && event.payload.readdCount === 1
      )));
    } finally {
      unsubscribe();
    }
  });
});
