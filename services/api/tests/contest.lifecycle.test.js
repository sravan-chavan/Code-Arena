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
});
