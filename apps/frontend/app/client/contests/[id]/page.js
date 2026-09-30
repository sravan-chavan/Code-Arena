'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ContestTimer from '@/components/ui/ContestTimer';
import { formatDateTime } from '@/lib/contestTime';
import { fetchStudentContest, fetchStudentQuestions, registerForContest } from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import { ChevronLeft } from 'lucide-react';

export default function StudentContestDetail() {
  const { id } = useParams();
  const [contest, setContest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  const load = useCallback(async () => {
    const nextContest = await fetchStudentContest(id);
    setContest(nextContest);
    if (nextContest.canEnter) {
      try {
        setQuestions(await fetchStudentQuestions(id));
      } catch (err) {
        setQuestions([]);
        setError(err instanceof ApiError ? err.message : 'Unable to load problems.');
      }
    } else {
      setQuestions([]);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load contest.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, load]);

  async function handleRegister() {
    setRegistering(true);
    setError('');
    setSuccess('');
    try {
      await registerForContest(id);
      setSuccess('You are registered.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to register.');
    } finally {
      setRegistering(false);
    }
  }

  if (loading) return <p style={{ padding: 'var(--space-xl)' }}>Loading contest…</p>;
  if (!contest) return <p style={{ padding: 'var(--space-xl)', color: 'var(--accent-rose)' }}>{error || 'Contest not found.'}</p>;

  return (
    <div className="space-y-6">
      <Link href="/client/contests" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        <ChevronLeft size={16} /> All contests
      </Link>
      <div className="page-header">
        <h1>{contest.title}</h1>
        <p>{contest.description}</p>
        <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge status={contest.status} />
          {contest.registration ? <Badge status={contest.registration.status} /> : null}
          <ContestTimer contest={contest} onExpired={load} />
        </div>
      </div>
      {error ? <p style={{ color: 'var(--accent-rose)' }}>{error}</p> : null}
      {success ? <p style={{ color: 'var(--accent-emerald)' }}>{success}</p> : null}

      <Card>
        <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Timing</h2>
        <p>Start: {formatDateTime(contest.startTime)}</p>
        <p>End: {formatDateTime(contest.endTime)}</p>
        <p>Duration: {contest.durationMinutes} minutes</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Times shown in your local timezone. Contest state uses server time.</p>
      </Card>

      <Card>
        <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Registration</h2>
        {contest.registration ? (
          <p>You are {contest.registration.status} as of {formatDateTime(contest.registration.registeredAt)}.</p>
        ) : (
          <p>{contest.eligibilityReason || 'You are not registered.'}</p>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)', flexWrap: 'wrap' }}>
          {contest.canRegister ? (
            <Button variant="primary" disabled={registering} onClick={handleRegister}>
              {registering ? 'Registering…' : 'Register'}
            </Button>
          ) : null}
          {contest.canEnter ? (
            <Link href={`/client/contests/${contest.id}/arena`}>
              <Button variant="primary">Enter Contest</Button>
            </Link>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Problems</h2>
        {contest.canEnter && questions.length > 0 ? (
          <ul style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            {questions.map((question, index) => (
              <li key={question.id} style={{ padding: 'var(--space-sm)', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
                <strong>{index + 1}. {question.title}</strong>
                <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>{question.difficulty}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>
            {contest.status === 'scheduled'
              ? 'Problems unlock when the contest starts.'
              : contest.canEnter
                ? 'No problems have been added yet.'
                : `${contest.questionCount ?? 0} problem(s). Statements are hidden until you can enter the arena.`}
          </p>
        )}
      </Card>
    </div>
  );
}
