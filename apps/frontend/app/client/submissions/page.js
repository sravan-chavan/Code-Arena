'use client';
import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { formatDate } from '@/lib/mockData';
import { fetchStudentSubmissions, formatStatus } from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';

export default function ClientSubmissions() {
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setSubmissions(await fetchStudentSubmissions());
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unable to load submissions.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1>Submissions</h1>
        <p>Real Judge0 results for your runs and submits.</p>
      </div>
      {error ? <p style={{ color: 'var(--accent-rose)' }}>{error}</p> : null}
      <Card>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>Language</th>
                <th>Status</th>
                <th>Tests</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5">Loading…</td></tr>
              ) : submissions.length === 0 ? (
                <tr><td colSpan="5">No submissions yet.</td></tr>
              ) : submissions.map((submission) => (
                <tr key={submission.id}>
                  <td>{formatDate(submission.createdAt)}</td>
                  <td>{submission.kind}</td>
                  <td>{submission.languageSlug}</td>
                  <td><Badge status={submission.status} customLabel={formatStatus(submission.status)} /></td>
                  <td>{submission.testsPassed ?? 0}/{submission.testsTotal ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
