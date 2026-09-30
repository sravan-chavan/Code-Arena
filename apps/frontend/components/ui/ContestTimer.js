'use client';
import { useEffect, useRef, useState } from 'react';
import { formatTime } from '@/lib/mockData';
import { remainingFromContest, remainingFromDeadline, serverNowMs } from '@/lib/contestTime';

export default function ContestTimer({ contest, deadline, onExpired }) {
  const fetchedAtRef = useRef(Date.now());
  const expiredRef = useRef(false);
  const [remaining, setRemaining] = useState(() => (
    deadline
      ? remainingFromDeadline(deadline, Date.now())
      : remainingFromContest(contest, Date.now())
  ));

  useEffect(() => {
    fetchedAtRef.current = Date.now();
    expiredRef.current = false;
  }, [contest?.id, contest?.serverTime, contest?.startTime, contest?.endTime, contest?.status, deadline]);

  useEffect(() => {
    if (deadline) {
      function tick() {
        const nowMs = serverNowMs(contest?.serverTime, fetchedAtRef.current);
        const secs = remainingFromDeadline(deadline, nowMs);
        setRemaining(secs);
        if (secs === 0 && !expiredRef.current) {
          expiredRef.current = true;
          onExpired?.();
        }
      }
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }

    if (!contest || (contest.status !== 'scheduled' && contest.status !== 'running')) {
      setRemaining(contest?.status === 'ended' ? 0 : null);
      return undefined;
    }
    if (contest.status === 'running' && !contest.endTime && contest.remainingTime == null) {
      setRemaining(null);
      return undefined;
    }

    function tick() {
      const nowMs = serverNowMs(contest.serverTime, fetchedAtRef.current);
      const secs = remainingFromContest(contest, nowMs);
      setRemaining(secs);
      if (secs === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpired?.();
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [contest, deadline, onExpired]);

  if (!deadline && contest?.status === 'running' && remaining == null) {
    return <span style={{ fontFamily: 'var(--font-code)', fontWeight: 700 }}>Open</span>;
  }
  if (remaining == null) return null;

  const label = !deadline && contest?.status === 'scheduled' ? 'Starts in' : 'Remaining';
  return (
    <span style={{ fontFamily: 'var(--font-code)', fontWeight: 700 }}>
      {label} {formatTime(remaining)}
    </span>
  );
}
