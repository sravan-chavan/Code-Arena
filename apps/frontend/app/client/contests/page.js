'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ContestTimer from '@/components/ui/ContestTimer';
import { formatDateTime } from '@/lib/contestTime';
import { enterContest, fetchStudentContests, registerForContest } from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import { Trophy, Clock, Calendar, ChevronRight } from 'lucide-react';

function contestAction(contest) {
  if (contest.status === 'cancelled') {
    return { label: 'Cancelled', href: `/client/contests/${contest.id}`, disabled: false, variant: 'secondary' };
  }
  if (contest.status === 'ended') {
    return { label: 'View', href: `/client/contests/${contest.id}`, disabled: false, variant: 'secondary' };
  }
  if (contest.canEnter) {
    return { label: 'Enter Contest', href: `/client/contests/${contest.id}/arena`, disabled: false, variant: 'primary' };
  }
  if (contest.registration && contest.status === 'scheduled') {
    return { label: 'Registered', href: `/client/contests/${contest.id}`, disabled: false, variant: 'secondary' };
  }
  if (contest.canRegister) {
    return { label: 'Register', href: `/client/contests/${contest.id}`, disabled: false, variant: 'primary' };
  }
  return { label: 'View', href: `/client/contests/${contest.id}`, disabled: false, variant: 'secondary' };
}

export default function ClientContests() {
  const [activeTab, setActiveTab] = useState('active');
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [registeringId, setRegisteringId] = useState('');
  const [enteringId, setEnteringId] = useState('');
  const router = useRouter();

  async function load() {
    setContests(await fetchStudentContests());
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchStudentContests();
        if (!cancelled) setContests(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load contests.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeContests = contests.filter((contest) => contest.status === 'running');
  const upcomingContests = contests.filter((contest) => contest.status === 'scheduled');
  const pastContests = contests.filter((contest) => contest.status === 'ended' || contest.status === 'cancelled');
  const listToRender = activeTab === 'active' ? activeContests : activeTab === 'upcoming' ? upcomingContests : pastContests;

  async function handleRegister(event, contestId) {
    event.preventDefault();
    setRegisteringId(contestId);
    setError('');
    try {
      await registerForContest(contestId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to register.');
    } finally {
      setRegisteringId('');
    }
  }

  async function handleEnter(contestId) {
    setEnteringId(contestId);
    setError('');
    try {
      await enterContest(contestId);
      router.push(`/client/contests/${contestId}/arena`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to enter contest.');
    } finally {
      setEnteringId('');
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1>Competition Arena</h1>
        <p>Register for scheduled contests and enter when they start.</p>
      </div>
      {error ? <p style={{ color: 'var(--accent-rose)' }}>{error}</p> : null}

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', marginBottom: 'var(--space-lg)' }}>
        {[
          ['active', `Active Contests (${activeContests.length})`],
          ['upcoming', `Upcoming (${upcomingContests.length})`],
          ['past', `Past Contests (${pastContests.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            style={{ padding: '12px 24px', fontWeight: 600, borderBottom: activeTab === key ? '2px solid var(--accent-cyan)' : '2px solid transparent', color: activeTab === key ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
            onClick={() => setActiveTab(key)}
          >{label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
        {loading ? <p>Loading contests…</p> : listToRender.length > 0 ? listToRender.map((contest) => {
          const action = contestAction(contest);
          return (
            <Card key={contest.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
                    <Trophy size={24} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{contest.title}</h2>
                    <div style={{ display: 'flex', gap: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> {contest.durationMinutes} mins</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> {formatDateTime(contest.startTime)}</span>
                    </div>
                  </div>
                </div>
                <Badge status={contest.status} />
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 'var(--space-sm)' }}>{contest.description}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-md)', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                <ContestTimer contest={contest} />
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  {contest.canRegister ? (
                    <Button variant="primary" disabled={registeringId === contest.id} onClick={(event) => handleRegister(event, contest.id)}>
                      {registeringId === contest.id ? 'Registering…' : 'Register'}
                    </Button>
                  ) : null}
                  {contest.canEnter ? (
                    <Button variant="primary" disabled={enteringId === contest.id} onClick={() => handleEnter(contest.id)}>
                      {enteringId === contest.id ? 'Entering…' : 'Enter Contest'}
                    </Button>
                  ) : (
                    <Link href={action.href}>
                      <Button variant={contest.canRegister ? 'secondary' : action.variant}>
                        {contest.canRegister ? 'Details' : action.label} <ChevronRight size={16} />
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </Card>
          );
        }) : (
          <div style={{ textAlign: 'center', padding: 'var(--space-3xl)' }}>
            <Trophy size={48} style={{ margin: '0 auto var(--space-md)', color: 'var(--border-default)' }} />
            <h3>No contests found</h3>
          </div>
        )}
      </div>
    </div>
  );
}
