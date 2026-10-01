'use client';

import { useEffect, useState } from 'react';
import { getRealtimeClient } from './realtimeClient';

export function useContestChannel(contestId, onEvent, { onReconnect, enabled = true } = {}) {
  const [status, setStatus] = useState('offline');

  useEffect(() => {
    if (!enabled || !contestId) return undefined;
    const client = getRealtimeClient();
    const offStatus = client.onStatus(setStatus);
    const offEvent = onEvent ? client.subscribe(contestId, onEvent) : () => {};
    const offReconnect = onReconnect ? client.onReconnect(onReconnect) : () => {};
    return () => {
      offStatus();
      offEvent();
      offReconnect();
    };
  }, [contestId, onEvent, onReconnect, enabled]);

  return status;
}

export function connectionLabel(status) {
  if (status === 'connected') return 'Live';
  if (status === 'reconnecting') return 'Reconnecting';
  return 'Offline';
}
