'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { metrics, submissions, systemLogs, formatTimestamp } from '@/lib/mockData';
import { fetchAdminContests } from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import ContestTimer from '@/components/ui/ContestTimer';
import { Users, Activity, CheckCircle, Clock, Server } from 'lucide-react';
import Link from 'next/link';

export default function AdminDashboard() {
  const { user, application, applicationError } = useAuth();
  const [contests, setContests] = useState([]);
  const [contestError, setContestError] = useState('');
  const recentLogs = systemLogs.slice(0, 5);
  const recentSubmissions = submissions.slice(0, 5);
  const dashboard = application?.dashboard;
  const applicationName = application?.me?.application?.name;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchAdminContests();
        if (!cancelled) setContests(rows);
      } catch (err) {
        if (!cancelled) setContestError(err instanceof ApiError ? err.message : 'Unable to load contests.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeContests = contests.filter((contest) => contest.status === 'running');

  return (
    <div>
      <div className="page-header">
        <h1>System Overview</h1>
        <p>{user?.email} · {user?.role ? user.role.charAt(0) + user.role.slice(1).toLowerCase() : ''}</p>
      </div>

      <Card style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="card-header">
          <h2 className="card-title">Application status (live API)</h2>
        </div>
        {applicationError ? (
          <p style={{ color: 'var(--accent-rose)', fontSize: '0.9rem' }}>{applicationError}</p>
        ) : dashboard ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {applicationName || dashboard.application} · role {dashboard.role} · status {dashboard.status}
          </p>
        ) : (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading application APIs…</p>
        )}
      </Card>

      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }}>
        Active contests below are live API data. Worker, queue, and submission figures remain mock/future data.
      </p>

      <div className="stats-grid">
        <div className="stat-card cyan">
          <div className="stat-card-header">
            <span className="stat-card-label">Active Users</span>
            <Users className="stat-card-icon" style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div className="stat-card-value">{metrics.connectedParticipants}</div>
        </div>
        
        <div className="stat-card purple">
          <div className="stat-card-header">
            <span className="stat-card-label">Workers Online</span>
            <Server className="stat-card-icon" style={{ color: 'var(--accent-purple)' }} />
          </div>
          <div className="stat-card-value">{metrics.onlineWorkers} / {metrics.onlineWorkers + metrics.offlineWorkers + metrics.busyWorkers}</div>
        </div>

        <div className="stat-card emerald">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Submissions</span>
            <CheckCircle className="stat-card-icon" style={{ color: 'var(--accent-emerald)' }} />
          </div>
          <div className="stat-card-value">{metrics.totalSubmissions}</div>
        </div>

        <div className="stat-card amber">
          <div className="stat-card-header">
            <span className="stat-card-label">Avg Exec Time</span>
            <Clock className="stat-card-icon" style={{ color: 'var(--accent-amber)' }} />
          </div>
          <div className="stat-card-value">{metrics.avgExecutionTime}ms</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <Card>
            <div className="card-header">
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Activity size={18} style={{ color: 'var(--accent-cyan)' }} /> Active Contests
              </h2>
            </div>
            
            {contestError ? <p style={{ color: 'var(--accent-rose)' }}>{contestError}</p> : null}
            {activeContests.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                {activeContests.map((contest) => (
                  <div key={contest.id} style={{ padding: 'var(--space-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
                      <div>
                        <Link href={`/admin/contests/${contest.id}`}>
                          <h3 style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{contest.title}</h3>
                        </Link>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{contest.participantCount ?? 0} Participants · {contest.questionCount ?? 0} Problems</p>
                      </div>
                      <Badge status={contest.status} />
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <ContestTimer contest={contest} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
                No active contests at the moment.
              </div>
            )}
          </Card>

          <Card>
            <div className="card-header">
              <h2 className="card-title">Recent Submissions</h2>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Question</th>
                    <th>Language</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSubmissions.map(sub => (
                    <tr key={sub.id}>
                      <td>{sub.userId}</td>
                      <td style={{ color: 'var(--accent-cyan)' }}>{sub.questionId}</td>
                      <td>{sub.language}</td>
                      <td><Badge status={sub.status} /></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{formatTimestamp(sub.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <Card>
            <div className="card-header">
              <h2 className="card-title">System Logs</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {recentLogs.map(log => (
                <div key={log.id} style={{ fontSize: '0.85rem', borderLeft: '2px solid var(--border-default)', paddingLeft: 'var(--space-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{formatTimestamp(log.timestamp)}</span>
                    <span style={{ 
                      fontFamily: 'var(--font-code)',
                      color: log.level === 'error' ? 'var(--accent-rose)' : 
                             log.level === 'warn' ? 'var(--accent-amber)' : 
                             log.level === 'success' ? 'var(--accent-emerald)' : 'var(--accent-cyan)'
                    }}>[{log.level.toUpperCase()}]</span>
                  </div>
                  <p style={{ color: 'var(--text-primary)' }}>{log.message}</p>
                </div>
              ))}
            </div>
          </Card>
          
          <Card>
            <div className="card-header">
              <h2 className="card-title">Queue Status</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Contest Queue</span>
                  <span style={{ fontFamily: 'var(--font-code)' }}>{metrics.contestQueueSize}</span>
                </div>
                <div style={{ width: '100%', background: 'var(--bg-primary)', borderRadius: 'var(--radius-full)', height: '6px' }}>
                  <div style={{ background: 'var(--accent-cyan)', height: '100%', borderRadius: 'var(--radius-full)', width: `${Math.min(100, metrics.contestQueueSize * 10)}%` }}></div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Practice Queue</span>
                  <span style={{ fontFamily: 'var(--font-code)' }}>{metrics.practiceQueueSize}</span>
                </div>
                <div style={{ width: '100%', background: 'var(--bg-primary)', borderRadius: 'var(--radius-full)', height: '6px' }}>
                  <div style={{ background: 'var(--accent-purple)', height: '100%', borderRadius: 'var(--radius-full)', width: `${Math.min(100, metrics.practiceQueueSize * 10)}%` }}></div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
