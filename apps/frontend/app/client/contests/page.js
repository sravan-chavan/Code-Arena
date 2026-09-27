'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { contests, formatTime, formatDate } from '@/lib/mockData';
import { Trophy, Clock, Calendar, Users, ChevronRight } from 'lucide-react';

export default function ClientContests() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('active'); // active, upcoming, past

  const activeContests = contests.filter(c => c.status === 'running');
  const upcomingContests = contests.filter(c => c.status === 'scheduled');
  const pastContests = contests.filter(c => c.status === 'ended');

  const getContestList = () => {
    if (activeTab === 'active') return activeContests;
    if (activeTab === 'upcoming') return upcomingContests;
    return pastContests;
  };

  const listToRender = getContestList();

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1>Competition Arena</h1>
        <p>Join live contests, view upcoming schedules, and review past performances.</p>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', marginBottom: 'var(--space-lg)' }}>
        <button 
          style={{ padding: '12px 24px', fontWeight: 600, borderBottom: activeTab === 'active' ? '2px solid var(--accent-cyan)' : '2px solid transparent', color: activeTab === 'active' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
          onClick={() => setActiveTab('active')}
        >
          Active Contests ({activeContests.length})
        </button>
        <button 
          style={{ padding: '12px 24px', fontWeight: 600, borderBottom: activeTab === 'upcoming' ? '2px solid var(--accent-blue)' : '2px solid transparent', color: activeTab === 'upcoming' ? 'var(--accent-blue)' : 'var(--text-secondary)' }}
          onClick={() => setActiveTab('upcoming')}
        >
          Upcoming ({upcomingContests.length})
        </button>
        <button 
          style={{ padding: '12px 24px', fontWeight: 600, borderBottom: activeTab === 'past' ? '2px solid var(--text-muted)' : '2px solid transparent', color: activeTab === 'past' ? 'var(--text-primary)' : 'var(--text-secondary)' }}
          onClick={() => setActiveTab('past')}
        >
          Past Contests ({pastContests.length})
        </button>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-md)' }}>
        {listToRender.length > 0 ? (
          listToRender.map(contest => {
            const isEnrolled = contest.participantIds.includes(user.id);
            return (
              <Card key={contest.id} hover={true} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: activeTab === 'active' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}>
                      <Trophy size={24} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{contest.title}</h2>
                      <div style={{ display: 'flex', gap: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> {contest.duration} mins</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={14} /> {contest.participantIds.length} Participants</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> {formatDate(contest.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <Badge status={contest.status} />
                </div>
                
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{contest.description}</p>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 'var(--space-sm)', borderTop: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.85rem' }}>
                    {isEnrolled ? (
                      <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>✓ Registered</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Not Registered</span>
                    )}
                  </div>
                  
                  {activeTab === 'active' ? (
                    <Link href={`/client/contests/${contest.id}`}>
                      <Button variant="primary">Enter Arena <ChevronRight size={16} /></Button>
                    </Link>
                  ) : activeTab === 'upcoming' ? (
                    <Button variant={isEnrolled ? 'secondary' : 'primary'}>
                      {isEnrolled ? 'Withdraw' : 'Register Now'}
                    </Button>
                  ) : (
                    <Link href={`/client/contests/${contest.id}/results`}>
                      <Button variant="secondary">View Results</Button>
                    </Link>
                  )}
                </div>
              </Card>
            );
          })
        ) : (
          <div style={{ textAlign: 'center', padding: 'var(--space-3xl)', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--border-default)' }}>
            <Trophy size={48} style={{ margin: '0 auto var(--space-md)', color: 'var(--border-default)' }} />
            <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: 'var(--space-xs)' }}>No contests found</h3>
            <p style={{ color: 'var(--text-secondary)' }}>There are no {activeTab} contests at the moment.</p>
          </div>
        )}
      </div>
    </div>
  );
}
