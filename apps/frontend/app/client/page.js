'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { formatDate, formatTime } from '@/lib/mockData';
import { fetchStudentContests, fetchStudentSubmissions, formatStatus } from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import { Trophy, Code, CheckCircle, Activity } from 'lucide-react';
import Link from 'next/link';

export default function ClientDashboard() {
  const { user, application, applicationError } = useAuth();
  const dashboard = application?.dashboard;
  const applicationName = application?.me?.application?.name;
  const [contests, setContests] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextContests, nextSubmissions] = await Promise.all([
          fetchStudentContests(),
          fetchStudentSubmissions(),
        ]);
        if (!cancelled) {
          setContests(nextContests);
          setSubmissions(nextSubmissions);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Unable to load dashboard data.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeContests = contests.filter((contest) => contest.status === 'running');
  const acceptedSubmissions = submissions.filter((submission) => submission.status === 'ACCEPTED').length;

  return (
    <div>
      <div className="page-header">
        <h1>Welcome, {user?.email}</h1>
        <p>Role: {user?.role}</p>
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

      {error ? <p style={{ color: 'var(--accent-rose)', marginBottom: 'var(--space-md)' }}>{error}</p> : null}

      <div className="stats-grid">
        <div className="stat-card cyan">
          <div className="stat-card-header">
            <span className="stat-card-label">Visible Contests</span>
            <Trophy className="stat-card-icon" style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div className="stat-card-value">{contests.length}</div>
        </div>

        <div className="stat-card emerald">
          <div className="stat-card-header">
            <span className="stat-card-label">Problems Solved</span>
            <CheckCircle className="stat-card-icon" style={{ color: 'var(--accent-emerald)' }} />
          </div>
          <div className="stat-card-value">{acceptedSubmissions}</div>
        </div>

        <div className="stat-card purple">
          <div className="stat-card-header">
            <span className="stat-card-label">Total Submissions</span>
            <Code className="stat-card-icon" style={{ color: 'var(--accent-purple)' }} />
          </div>
          <div className="stat-card-value">{submissions.length}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
        <Card>
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Activity size={18} style={{ color: 'var(--accent-rose)' }} /> Active Contests
            </h2>
          </div>

          {activeContests.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {activeContests.map((contest) => (
                <div key={contest.id} style={{ padding: 'var(--space-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
                    <h3 style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '1.1rem' }}>{contest.title}</h3>
                    <Badge status={contest.status} />
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>{contest.description}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Time Remaining:</span>{' '}
                      <span style={{ fontFamily: 'var(--font-code)', color: 'var(--accent-rose)' }}>
                        {formatTime(contest.remainingTime == null ? contest.durationMinutes * 60 : contest.remainingTime)}
                      </span>
                    </div>
                    <Link href={contest.canEnter ? `/client/contests/${contest.id}/arena` : `/client/contests/${contest.id}`}>
                      <Button variant="primary" className="btn-sm">{contest.canEnter ? 'Enter Arena' : 'View contest'}</Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 'var(--space-xl)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)' }}>
              <Trophy size={32} style={{ margin: '0 auto var(--space-sm)', color: 'var(--border-default)' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No active contests at the moment.</p>
              <Link href="/client/contests">
                <Button variant="ghost" style={{ marginTop: 'var(--space-sm)', color: 'var(--accent-cyan)' }}>View contests</Button>
              </Link>
            </div>
          )}
        </Card>

        <Card>
          <div className="card-header">
            <h2 className="card-title">Recent Submissions</h2>
            <Link href="/client/submissions" style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>View All</Link>
          </div>

          {submissions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {submissions.slice(0, 4).map((submission) => (
                <div key={submission.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatStatus(submission.status)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatDate(submission.createdAt)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-code)' }}>{submission.languageSlug}</span>
                    <Badge status={submission.status} customLabel={formatStatus(submission.status)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
              No submissions yet. Enter a contest to run code.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
