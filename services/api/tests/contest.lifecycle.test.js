const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const clock = require('../src/contests/clock');
const lifecycle = require('../src/contests/contest.lifecycle');

const START = '2026-09-30T15:00:00.000Z';
const END = '2026-09-30T18:00:00.000Z';

function timedContest(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000009',
    title: 'Timed',
    description: '',
    status: 'scheduled',
    startTime: START,
    endTime: END,
    durationMinutes: 180,
    ...overrides,
  };
}

describe('Contest lifecycle', () => {
  afterEach(() => {
    clock.resetNow();
  });

  it('keeps draft and cancelled sticky regardless of the clock', () => {
    clock.setNow('2026-09-30T16:00:00.000Z');
    assert.equal(lifecycle.computeEffectiveStatus(timedContest({ status: 'draft' })), 'draft');
    assert.equal(
      lifecycle.computeEffectiveStatus(timedContest({ status: 'cancelled' })),
      'cancelled',
    );
  });

  it('keeps an explicit ended stored status sticky', () => {
    clock.setNow('2026-09-30T16:00:00.000Z');
    assert.equal(lifecycle.computeEffectiveStatus(timedContest({ status: 'ended' })), 'ended');
  });

  it('maps scheduled contests through running to ended from server time', () => {
    const contest = timedContest();
    clock.setNow('2026-09-30T14:59:59.000Z');
    assert.equal(lifecycle.computeEffectiveStatus(contest), 'scheduled');
    clock.setNow(START);
    assert.equal(lifecycle.computeEffectiveStatus(contest), 'running');
    clock.setNow('2026-09-30T17:59:59.000Z');
    assert.equal(lifecycle.computeEffectiveStatus(contest), 'running');
    clock.setNow(END);
    assert.equal(lifecycle.computeEffectiveStatus(contest), 'ended');
  });

  it('treats open-ended contests without start_time as stored status', () => {
    clock.setNow('2026-09-30T20:00:00.000Z');
    assert.equal(
      lifecycle.computeEffectiveStatus({
        status: 'running',
        startTime: null,
        endTime: null,
        durationMinutes: 180,
      }),
      'running',
    );
    assert.equal(
      lifecycle.remainingSeconds({
        status: 'running',
        startTime: null,
        endTime: null,
        durationMinutes: 180,
      }),
      null,
    );
  });

  it('computes remaining and startsIn from the injected clock', () => {
    const contest = timedContest();
    clock.setNow('2026-09-30T14:00:00.000Z');
    assert.equal(lifecycle.startsInSeconds(contest), 3600);
    assert.equal(lifecycle.remainingSeconds(contest), null);
    clock.setNow('2026-09-30T16:00:00.000Z');
    assert.equal(lifecycle.startsInSeconds(contest), null);
    assert.equal(lifecycle.remainingSeconds(contest), 2 * 60 * 60);
  });

  it('allows only documented admin transitions', () => {
    lifecycle.assertAdminTransition('draft', 'scheduled');
    lifecycle.assertAdminTransition('draft', 'cancelled');
    lifecycle.assertAdminTransition('scheduled', 'cancelled');
    lifecycle.assertAdminTransition('running', 'ended');
    lifecycle.assertAdminTransition('ended', 'running');
    assert.throws(
      () => lifecycle.assertAdminTransition('scheduled', 'running'),
      (err) => err.statusCode === 409 && err.code === 'INVALID_TRANSITION',
    );
    assert.throws(
      () => lifecycle.assertAdminTransition('running', 'cancelled'),
      (err) => err.statusCode === 409,
    );
    assert.throws(
      () => lifecycle.assertAdminTransition('ended', 'scheduled'),
      (err) => err.statusCode === 409,
    );
    assert.throws(
      () => lifecycle.assertAdminTransition('cancelled', 'draft'),
      (err) => err.statusCode === 409,
    );
  });

  it('opens registration for scheduled and running contests only', () => {
    assert.equal(lifecycle.canRegister('draft'), false);
    assert.equal(lifecycle.canRegister('scheduled'), true);
    assert.equal(lifecycle.canRegister('running'), true);
    assert.equal(lifecycle.canRegister('ended'), false);
    assert.equal(lifecycle.canRegister('cancelled'), false);
  });

  it('requires registration before arena entry', () => {
    assert.equal(lifecycle.canEnter('running', null), false);
    assert.equal(lifecycle.canEnter('running', { status: 'registered' }), true);
    assert.equal(lifecycle.canEnter('scheduled', { status: 'registered' }), false);
    assert.equal(lifecycle.canEnter('ended', { status: 'registered' }), false);
  });

  it('limits editable contest fields by effective status', () => {
    assert.deepEqual(
      lifecycle.editableFields('draft', 'draft'),
      ['title', 'description', 'startTime', 'endTime', 'durationMinutes'],
    );
    assert.deepEqual(
      lifecycle.editableFields('scheduled', 'scheduled'),
      ['title', 'description', 'startTime', 'endTime', 'durationMinutes'],
    );
    assert.deepEqual(
      lifecycle.editableFields('running', 'scheduled'),
      ['title', 'description'],
    );
    assert.deepEqual(lifecycle.editableFields('ended', 'ended'), []);
    assert.deepEqual(lifecycle.editableFields('cancelled', 'cancelled'), []);
  });

  it('blocks exited and removed participants and offers resume only after ended', () => {
    assert.equal(lifecycle.canEnter('running', { status: 'exited' }), false);
    assert.equal(lifecycle.canEnter('running', { status: 'removed' }), false);
    assert.deepEqual(lifecycle.allowedAdminActions('ended', 'ended'), ['resume']);
    assert.deepEqual(lifecycle.allowedAdminActions('running', 'running'), ['update', 'end']);
    assert.equal(
      lifecycle.eligibilityForStudent('running', { status: 'exited' }).canEnter,
      false,
    );
  });

  it('keeps exited and removed participants unchanged when a contest resumes', () => {
    const nowMs = Date.parse('2026-09-30T16:00:00.000Z');
    const previousEnd = '2026-09-30T15:00:00.000Z';
    const nextEnd = '2026-09-30T17:00:00.000Z';
    assert.equal(lifecycle.nextParticipantStateAfterResume({
      status: 'exited',
      startedAt: START,
      effectiveDeadline: previousEnd,
    }, { previousEndTime: previousEnd, newEndTime: nextEnd, nowMs }), null);
    assert.equal(lifecycle.nextParticipantStateAfterResume({
      status: 'removed',
      startedAt: START,
      effectiveDeadline: previousEnd,
    }, { previousEndTime: previousEnd, newEndTime: nextEnd, nowMs }), null);
  });

  it('extends a contest-capped deadline to the resumed end and leaves an early personal expiry', () => {
    const nowMs = Date.parse('2026-09-30T16:00:00.000Z');
    const previousEnd = '2026-09-30T16:00:00.000Z';
    const nextEnd = '2026-09-30T17:00:00.000Z';
    const extended = lifecycle.nextParticipantStateAfterResume({
      status: 'completed',
      startedAt: START,
      completedAt: previousEnd,
      effectiveDeadline: previousEnd,
    }, { previousEndTime: previousEnd, newEndTime: nextEnd, nowMs });
    assert.equal(extended.status, 'started');
    assert.equal(extended.completedAt, null);
    assert.equal(extended.effectiveDeadline, nextEnd);

    const personal = lifecycle.nextParticipantStateAfterResume({
      status: 'completed',
      startedAt: '2026-09-30T12:00:00.000Z',
      completedAt: '2026-09-30T13:00:00.000Z',
      effectiveDeadline: '2026-09-30T13:00:00.000Z',
    }, { previousEndTime: previousEnd, newEndTime: nextEnd, nowMs });
    assert.equal(personal, null);
  });

  it('restores an exited participant without clearing the historical exit', () => {
    clock.setNow('2026-09-30T16:00:00.000Z');
    const restored = lifecycle.nextParticipantStateAfterReadd({
      status: 'exited',
      startedAt: START,
      effectiveDeadline: '2026-09-30T15:00:00.000Z',
      score: 15,
    }, timedContest({ status: 'running', endTime: END }), Date.parse('2026-09-30T16:00:00.000Z'));
    assert.equal(restored.status, 'started');
    assert.equal(restored.completedAt, null);
    assert.equal(restored.effectiveDeadline, END);
    assert.equal(restored.score, undefined);
    assert.equal(lifecycle.nextParticipantStateAfterReadd({ status: 'removed' }, timedContest(), Date.parse(START)), null);
  });
});
