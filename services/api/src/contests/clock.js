/**
 * Authoritative contest clock. Controllers must not call Date.now() for
 * lifecycle decisions. Tests inject a fixed instant via setNow().
 */

let nowFn = () => Date.now();

function now() {
  return nowFn();
}

function isoNow() {
  return new Date(now()).toISOString();
}

function setNow(value) {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error('clock.setNow requires a millisecond timestamp or ISO string');
  }
  nowFn = () => ms;
}

function resetNow() {
  nowFn = () => Date.now();
}

module.exports = {
  now,
  isoNow,
  setNow,
  resetNow,
};
