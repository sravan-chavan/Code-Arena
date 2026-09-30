export function localInputToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function isoToLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export function serverNowMs(serverTime, fetchedAtMs = Date.now()) {
  if (!serverTime) return Date.now();
  const parsed = Date.parse(serverTime);
  if (Number.isNaN(parsed)) return Date.now();
  return Date.now() + (parsed - fetchedAtMs);
}

export function remainingFromDeadline(deadline, nowMs) {
  if (!deadline) return null;
  const end = Date.parse(deadline);
  if (Number.isNaN(end)) return null;
  return Math.max(0, Math.floor((end - nowMs) / 1000));
}

export function remainingFromContest(contest, nowMs) {
  if (!contest) return null;
  if (contest.status === 'scheduled' && contest.startTime) {
    const start = Date.parse(contest.startTime);
    if (Number.isNaN(start)) return contest.startsIn ?? null;
    return Math.max(0, Math.floor((start - nowMs) / 1000));
  }
  if (contest.status === 'running') {
    if (!contest.endTime) return contest.remainingTime ?? null;
    const end = Date.parse(contest.endTime);
    if (Number.isNaN(end)) return contest.remainingTime ?? null;
    return Math.max(0, Math.floor((end - nowMs) / 1000));
  }
  return 0;
}
