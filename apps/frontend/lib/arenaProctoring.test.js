const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DUPLICATE_WINDOW_MS,
  attachArenaProctor,
  createProctorState,
  isExitShortcut,
  requestArenaFullscreen,
} = require('./arenaProctoring');

function createTarget() {
  const listeners = [];
  return {
    listeners,
    addEventListener(type, fn) {
      listeners.push({ type, fn });
    },
    removeEventListener(type, fn) {
      const index = listeners.findIndex((item) => item.type === type && item.fn === fn);
      if (index >= 0) listeners.splice(index, 1);
    },
    dispatch(type, event) {
      for (const item of [...listeners]) {
        if (item.type === type) item.fn(event || {});
      }
    },
    count(type) {
      return listeners.filter((item) => item.type === type).length;
    },
  };
}

function createHarness(options = {}) {
  const documentTarget = createTarget();
  const windowTarget = createTarget();
  const doc = {
    ...documentTarget,
    visibilityState: 'visible',
    fullscreenElement: null,
    documentElement: {},
  };
  const queue = [];
  const violations = [];
  const exits = [];
  const fullscreen = [];
  const blurs = [];
  let clock = 10_000;
  const state = createProctorState();
  const cleanup = attachArenaProctor({
    document: doc,
    window: windowTarget,
    randomUUID: () => `11111111-1111-4111-8111-${String(violations.length + queue.length + 1).padStart(12, '0')}`,
  }, {
    allow: options.allow || (() => true),
    onViolation: (claim) => {
      violations.push(claim);
      if (options.failViolation) {
        return Promise.reject(new Error('network'));
      }
      return undefined;
    },
    onIntentionalExit: () => exits.push('exit'),
    onFullscreenChange: (payload) => fullscreen.push(payload),
    onBlur: () => blurs.push('blur'),
  }, {
    state,
    now: () => clock,
    schedule(fn) {
      const handle = { fn, cancelled: false };
      queue.push(handle);
      return handle;
    },
    cancel(handle) {
      handle.cancelled = true;
      const index = queue.indexOf(handle);
      if (index >= 0) queue.splice(index, 1);
    },
  });

  return {
    doc,
    windowTarget,
    state,
    violations,
    exits,
    fullscreen,
    blurs,
    queue,
    cleanup,
    setNow(value) { clock = value; },
    advance(ms) { clock += ms; },
    flush() {
      const batch = queue.splice(0, queue.length);
      for (const handle of batch) {
        if (!handle.cancelled) handle.fn();
      }
    },
  };
}

function key(partial) {
  return {
    repeat: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    key: '',
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
    ...partial,
  };
}

describe('arena fullscreen request', () => {
  it('requests fullscreen from a user-gesture caller', async () => {
    let called = 0;
    const result = await requestArenaFullscreen({
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: async () => { called += 1; },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.reason, 'entered');
    assert.equal(called, 1);
  });

  it('reports fullscreen rejection without retrying', async () => {
    let called = 0;
    const result = await requestArenaFullscreen({
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: async () => {
          called += 1;
          const err = new Error('blocked');
          err.name = 'NotAllowedError';
          throw err;
        },
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'NotAllowedError');
    assert.equal(called, 1);
  });

  it('reports unsupported browsers', async () => {
    const result = await requestArenaFullscreen({ documentElement: {} });
    assert.deepEqual(result, { ok: false, reason: 'unsupported' });
  });
});

describe('arena proctor events', () => {
  it('records a hidden tab after the delay and ignores blur and focus alone', async () => {
    const harness = createHarness();
    harness.windowTarget.dispatch('blur');
    harness.windowTarget.dispatch('focus');
    harness.flush();
    assert.equal(harness.violations.length, 0);
    assert.equal(harness.blurs.length, 1);
    assert.ok(harness.state.lastBlurAt > 0);
    assert.ok(harness.state.lastFocusAt > 0);

    harness.doc.visibilityState = 'hidden';
    harness.doc.dispatch('visibilitychange');
    assert.equal(harness.violations.length, 0);
    harness.flush();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.violations.length, 1);
    assert.equal(harness.violations[0].source, 'visibilitychange');
    assert.equal(harness.violations[0].type, 'TAB_SWITCH');
    assert.equal(harness.violations[0].blurObserved, true);
  });

  it('ignores fullscreen exit before fullscreen was entered and records an unexpected exit after', async () => {
    const harness = createHarness();
    harness.doc.fullscreenElement = null;
    harness.doc.dispatch('fullscreenchange');
    harness.flush();
    assert.equal(harness.violations.length, 0);

    harness.doc.fullscreenElement = {};
    harness.doc.dispatch('fullscreenchange');
    assert.equal(harness.fullscreen.at(-1).active, true);
    assert.equal(harness.state.fullscreenEngaged, true);
    harness.flush();
    assert.equal(harness.violations.length, 0);

    harness.doc.fullscreenElement = null;
    harness.doc.dispatch('fullscreenchange');
    harness.flush();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.violations.length, 1);
    assert.equal(harness.violations[0].source, 'fullscreenchange');
    assert.equal(harness.fullscreen.at(-1).active, false);
  });

  it('treats Ctrl+Shift+C as an intentional exit and does not also invalidate', () => {
    const harness = createHarness();
    harness.doc.fullscreenElement = {};
    harness.doc.dispatch('fullscreenchange');
    const event = key({ ctrlKey: true, shiftKey: true, key: 'C' });
    harness.windowTarget.dispatch('keydown', event);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
    assert.equal(harness.exits.length, 1);

    harness.doc.fullscreenElement = null;
    harness.doc.dispatch('fullscreenchange');
    harness.flush();
    assert.equal(harness.violations.length, 0);
    assert.equal(isExitShortcut(key({ ctrlKey: true, shiftKey: true, altKey: true, key: 'c' })), false);
    assert.equal(isExitShortcut(key({ ctrlKey: true, shiftKey: true, key: 'C', repeat: true })), false);
  });

  it('collapses duplicate visibility and fullscreen events into one report', async () => {
    const harness = createHarness();
    harness.state.fullscreenEngaged = true;
    harness.doc.visibilityState = 'hidden';
    harness.doc.dispatch('visibilitychange');
    harness.doc.fullscreenElement = null;
    harness.doc.dispatch('fullscreenchange');
    assert.equal(harness.queue.length, 1);
    harness.flush();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.violations.length, 1);

    harness.advance(DUPLICATE_WINDOW_MS + 1);
    harness.doc.dispatch('visibilitychange');
    assert.equal(harness.queue.length, 1);
    harness.flush();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.violations.length, 2);
  });

  it('cancels a pending report on refresh and removes listeners on cleanup', () => {
    const harness = createHarness();
    harness.doc.visibilityState = 'hidden';
    harness.doc.dispatch('visibilitychange');
    assert.equal(harness.queue.length, 1);
    harness.windowTarget.dispatch('pagehide');
    harness.flush();
    assert.equal(harness.violations.length, 0);

    harness.cleanup();
    assert.equal(harness.doc.count('visibilitychange'), 0);
    assert.equal(harness.windowTarget.count('keydown'), 0);
    harness.doc.dispatch('visibilitychange');
    harness.windowTarget.dispatch('keydown', key({ ctrlKey: true, shiftKey: true, key: 'c' }));
    assert.equal(harness.queue.length, 0);
    assert.equal(harness.exits.length, 0);
  });

  it('does not report while the contest session is closed', () => {
    const harness = createHarness({ allow: () => false });
    harness.doc.visibilityState = 'hidden';
    harness.doc.dispatch('visibilitychange');
    harness.flush();
    assert.equal(harness.violations.length, 0);
  });

  it('keeps the same client event id when the report fails so a retry is idempotent', async () => {
    const harness = createHarness({ failViolation: true });
    harness.doc.visibilityState = 'hidden';
    harness.doc.dispatch('visibilitychange');
    harness.flush();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.violations.length, 1);
    const firstId = harness.violations[0].clientEventId;
    assert.equal(harness.state.pendingClientEventId, firstId);

    harness.advance(DUPLICATE_WINDOW_MS + 5);
    harness.doc.dispatch('visibilitychange');
    harness.flush();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.violations.length, 2);
    assert.equal(harness.violations[1].clientEventId, firstId);
  });
});
