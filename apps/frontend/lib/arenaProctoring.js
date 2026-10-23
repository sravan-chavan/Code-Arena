/**
 * Arena proctoring decisions.
 *
 * A page cannot disable operating-system shortcuts. This module only reacts
 * to browser events the page actually receives.
 *
 * Violations (current question only, student stays in the contest):
 * - visibilityState hidden, after a short delay, unless the document is unloading
 * - fullscreen exit after fullscreen was entered, unless the student chose to exit
 *
 * blur and focus are recorded as supporting timestamps and never start a violation.
 * Ctrl+Shift+C, when delivered, is an intentional contest exit and suppresses
 * the fullscreen-exit violation that leaving fullscreen would otherwise record.
 * pagehide/beforeunload cancel a pending report so a refresh is not a violation.
 */

const DUPLICATE_WINDOW_MS = 1500;
const VIOLATION_DELAY_MS = 400;
const VIOLATION_SOURCES = new Set(['visibilitychange', 'fullscreenchange']);

function createProctorState() {
  return {
    reporting: false,
    intentionalExit: false,
    unloading: false,
    cleanedUp: false,
    fullscreenEngaged: false,
    lastViolationAt: 0,
    pendingClientEventId: null,
    lastBlurAt: 0,
    lastFocusAt: 0,
  };
}

function createClientEventId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isExitShortcut(event) {
  if (!event || event.repeat) return false;
  const key = typeof event.key === 'string' ? event.key : '';
  return Boolean(
    event.ctrlKey
    && event.shiftKey
    && !event.altKey
    && !event.metaKey
    && (key === 'C' || key === 'c'),
  );
}

function markFullscreenEngaged(state) {
  if (!state || state.cleanedUp) return;
  state.fullscreenEngaged = true;
}

function markIntentionalExit(state) {
  if (!state) return;
  state.intentionalExit = true;
}

function clearIntentionalExit(state) {
  if (!state || state.cleanedUp) return;
  state.intentionalExit = false;
}

function markUnloading(state) {
  if (!state) return;
  state.unloading = true;
}

function claimViolation(state, source, now, randomUUID) {
  if (!state || state.cleanedUp || state.intentionalExit || state.unloading || state.reporting) {
    return null;
  }
  if (!VIOLATION_SOURCES.has(source)) return null;
  if (source === 'fullscreenchange' && !state.fullscreenEngaged) return null;
  const retrying = Boolean(state.pendingClientEventId);
  if (!retrying && now - state.lastViolationAt < DUPLICATE_WINDOW_MS) return null;
  const clientEventId = state.pendingClientEventId || randomUUID();
  state.reporting = true;
  state.pendingClientEventId = clientEventId;
  state.lastViolationAt = now;
  return {
    type: 'TAB_SWITCH',
    source,
    clientEventId,
    blurObserved: Boolean(state.lastBlurAt && now - state.lastBlurAt < 2000),
  };
}

function settleViolation(state, { ok }) {
  if (!state) return;
  state.reporting = false;
  if (ok) state.pendingClientEventId = null;
}

async function requestArenaFullscreen(doc) {
  const element = doc && doc.documentElement;
  if (!element || typeof element.requestFullscreen !== 'function') {
    return { ok: false, reason: 'unsupported' };
  }
  if (doc.fullscreenElement) {
    return { ok: true, reason: 'already' };
  }
  try {
    await element.requestFullscreen();
    return { ok: true, reason: 'entered' };
  } catch (err) {
    return { ok: false, reason: (err && err.name) || 'rejected' };
  }
}

function attachArenaProctor(targets, handlers, options = {}) {
  const state = options.state || createProctorState();
  const now = options.now || (() => Date.now());
  const delayMs = options.delayMs === undefined ? VIOLATION_DELAY_MS : options.delayMs;
  const schedule = options.schedule || ((fn, ms) => setTimeout(fn, ms));
  const cancel = options.cancel || ((timer) => clearTimeout(timer));
  const randomUUID = targets.randomUUID || createClientEventId;
  const doc = targets.document;
  const win = targets.window;
  const timers = new Set();

  function arm(source) {
    if (state.cleanedUp) return;
    if (typeof handlers.allow === 'function' && handlers.allow() === false) return;
    const claim = claimViolation(state, source, now(), randomUUID);
    if (!claim) return;
    const timer = schedule(() => {
      timers.delete(timer);
      if (state.cleanedUp || state.unloading || state.intentionalExit) {
        settleViolation(state, { ok: true });
        return;
      }
      if (typeof handlers.allow === 'function' && handlers.allow() === false) {
        settleViolation(state, { ok: true });
        return;
      }
      Promise.resolve(handlers.onViolation(claim))
        .then(() => settleViolation(state, { ok: true }))
        .catch(() => settleViolation(state, { ok: false }));
    }, delayMs);
    timers.add(timer);
  }

  function onVisibility() {
    if (doc.visibilityState === 'hidden') arm('visibilitychange');
  }

  function onFullscreen() {
    const active = Boolean(doc.fullscreenElement);
    if (active) markFullscreenEngaged(state);
    if (typeof handlers.onFullscreenChange === 'function') {
      handlers.onFullscreenChange({ active });
    }
    if (!active) arm('fullscreenchange');
  }

  function onKeyDown(event) {
    if (!isExitShortcut(event)) return;
    if (state.cleanedUp) return;
    markIntentionalExit(state);
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    if (typeof handlers.onIntentionalExit === 'function') handlers.onIntentionalExit();
  }

  function onPageHide() {
    markUnloading(state);
  }

  function onBlur() {
    state.lastBlurAt = now();
    if (typeof handlers.onBlur === 'function') handlers.onBlur();
  }

  function onFocus() {
    state.lastFocusAt = now();
    if (typeof handlers.onFocus === 'function') handlers.onFocus();
  }

  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('fullscreenchange', onFullscreen);
  win.addEventListener('keydown', onKeyDown, true);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('beforeunload', onPageHide);
  win.addEventListener('blur', onBlur);
  win.addEventListener('focus', onFocus);

  return function cleanup() {
    state.cleanedUp = true;
    for (const timer of timers) cancel(timer);
    timers.clear();
    doc.removeEventListener('visibilitychange', onVisibility);
    doc.removeEventListener('fullscreenchange', onFullscreen);
    win.removeEventListener('keydown', onKeyDown, true);
    win.removeEventListener('pagehide', onPageHide);
    win.removeEventListener('beforeunload', onPageHide);
    win.removeEventListener('blur', onBlur);
    win.removeEventListener('focus', onFocus);
  };
}

module.exports = {
  DUPLICATE_WINDOW_MS,
  VIOLATION_DELAY_MS,
  createProctorState,
  createClientEventId,
  isExitShortcut,
  markFullscreenEngaged,
  markIntentionalExit,
  clearIntentionalExit,
  markUnloading,
  claimViolation,
  settleViolation,
  requestArenaFullscreen,
  attachArenaProctor,
};
