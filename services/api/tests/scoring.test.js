const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const scoring = require('../src/contests/scoring');

describe('Contest scoring helpers', () => {
  it('defaults omitted points to 10 and sums question totals', () => {
    assert.equal(scoring.parsePoints(undefined), 10);
    assert.equal(scoring.parsePoints(null), 10);
    assert.equal(scoring.parsePoints(''), 10);
    assert.equal(scoring.parsePoints(20), 20);
    assert.equal(scoring.sumTestCasePoints([
      { points: 10 },
      { points: 20 },
      { points: 30 },
    ]), 60);
  });

  it('excludes invalidated questions from earned and possible scores', () => {
    const questions = [
      { totalPoints: 40, earnedPoints: 20, invalidated: false },
      { totalPoints: 40, earnedPoints: 40, invalidated: false },
      { totalPoints: 40, earnedPoints: 40, invalidated: true },
    ];
    assert.equal(scoring.participantEarnedScore(questions), 60);
    assert.equal(scoring.participantPossibleScore(questions), 80);
  });

  it('caps the session deadline by contest end time', () => {
    const deadline = scoring.computeEffectiveDeadline({
      startedAt: '2026-09-30T11:30:00.000Z',
      durationMinutes: 60,
      contestEndTime: '2026-09-30T12:00:00.000Z',
    });
    assert.equal(deadline, '2026-09-30T12:00:00.000Z');
  });

  it('applies ICPC-inspired penalty only to scoring questions', () => {
    const penalty = scoring.calculatePenalty({
      contest: { startTime: '2026-09-30T11:00:00.000Z' },
      participant: { startedAt: '2026-09-30T11:00:00.000Z' },
      questions: [
        {
          earnedPoints: 20,
          invalidated: false,
          submissions: [
            {
              kind: 'submit',
              score: 0,
              status: 'WRONG_ANSWER',
              evaluatedAt: '2026-09-30T11:05:00.000Z',
            },
            {
              kind: 'submit',
              score: 20,
              status: 'WRONG_ANSWER',
              evaluatedAt: '2026-09-30T11:10:00.000Z',
            },
          ],
        },
        {
          earnedPoints: 0,
          invalidated: true,
          submissions: [
            {
              kind: 'submit',
              score: 40,
              status: 'ACCEPTED',
              evaluatedAt: '2026-09-30T11:20:00.000Z',
            },
          ],
        },
      ],
    });
    assert.equal(penalty, 10 + 20);
  });

  it('ranks by score, then penalty, then last scoring time, then user id', () => {
    const ranked = scoring.assignRanks([
      { userId: 'b', score: 60, penalty: 40, lastScoringAt: '2026-09-30T11:20:00.000Z' },
      { userId: 'a', score: 60, penalty: 20, lastScoringAt: '2026-09-30T11:30:00.000Z' },
      { userId: 'c', score: 40, penalty: 0, lastScoringAt: '2026-09-30T11:05:00.000Z' },
    ]);
    assert.deepEqual(ranked.map((row) => row.userId), ['a', 'b', 'c']);
    assert.deepEqual(ranked.map((row) => row.rank), [1, 2, 3]);
  });
});
