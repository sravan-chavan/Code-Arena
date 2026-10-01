'use client';

import { connectionLabel } from '@/lib/useContestChannel';

export default function ConnectionStatus({ status }) {
  const label = connectionLabel(status);
  const color = status === 'connected'
    ? 'var(--text-muted)'
    : status === 'reconnecting'
      ? 'var(--accent-cyan)'
      : 'var(--accent-rose)';
  return (
    <span data-testid="ws-status" style={{ fontSize: '0.75rem', color, fontWeight: 600 }}>
      {label}
    </span>
  );
}
