'use client';
import { useAuth } from '@/lib/AuthContext';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { getSubmissionsForUser, formatTimestamp, formatDate } from '@/lib/mockData';
import { Code2, Clock, CheckCircle, XCircle } from 'lucide-react';

export default function ClientSubmissions() {
  const { user } = useAuth();
  const userSubmissions = getSubmissionsForUser(user.id);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1>Submission History</h1>
        <p>Review your past submissions and execution results.</p>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <h2 className="card-title">All Submissions</h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Total: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{userSubmissions.length}</span>
          </div>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Language</th>
                <th>Status</th>
                <th>Tests Passed</th>
                <th>Performance</th>
                <th>Submitted At</th>
              </tr>
            </thead>
            <tbody>
              {userSubmissions.length > 0 ? userSubmissions.map(sub => (
                <tr key={sub.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{sub.questionId}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Contest: {sub.contestId}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-code)' }}>
                      <Code2 size={14} /> {sub.language}
                    </div>
                  </td>
                  <td><Badge status={sub.status} /></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                      {sub.testsPassed === sub.totalTests ? (
                        <CheckCircle size={14} style={{ color: 'var(--accent-emerald)' }} />
                      ) : (
                        <XCircle size={14} style={{ color: 'var(--accent-rose)' }} />
                      )}
                      <span style={{ color: sub.testsPassed === sub.totalTests ? 'var(--accent-emerald)' : 'var(--text-primary)' }}>
                        {sub.testsPassed} / {sub.totalTests}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <div><Clock size={12} style={{ display: 'inline', marginRight: '4px' }}/> {sub.runtime} ms</div>
                      <div>Mem: {sub.memory} MB</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{formatDate(sub.submittedAt)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatTimestamp(sub.submittedAt)}</div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
                    You have not made any submissions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
