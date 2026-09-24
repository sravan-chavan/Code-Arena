'use client';
import { useAuth } from '@/lib/AuthContext';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { contests, getSubmissionsForUser, formatTime, formatDate } from '@/lib/mockData';
import { Trophy, Code, CheckCircle, Activity } from 'lucide-react';
import Link from 'next/link';

export default function ClientDashboard() {
  const { user } = useAuth();
  
  const userSubmissions = getSubmissionsForUser(user.id);
  const acceptedSubmissions = userSubmissions.filter(s => s.status === 'accepted').length;
  
  const enrolledContests = contests.filter(c => c.participantIds.includes(user.id));
  const activeEnrolled = enrolledContests.filter(c => c.status === 'running');

  return (
    <div>
      <div className="page-header">
        <h1>Welcome, {user.name}!</h1>
        <p>Roll No: {user.rollNo}</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card cyan">
          <div className="stat-card-header">
            <span className="stat-card-label">Contests Participated</span>
            <Trophy className="stat-card-icon" style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div className="stat-card-value">{enrolledContests.length}</div>
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
          <div className="stat-card-value">{userSubmissions.length}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
        <Card>
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Activity size={18} style={{ color: 'var(--accent-rose)' }} /> Active Contests
            </h2>
          </div>
          
          {activeEnrolled.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              {activeEnrolled.map(contest => (
                <div key={contest.id} style={{ position: 'relative', overflow: 'hidden', padding: 'var(--space-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                  
                  <div style={{ position: 'relative', zIndex: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
                      <h3 style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '1.1rem' }}>{contest.title}</h3>
                      <Badge status={contest.status} />
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>{contest.description}</p>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Time Remaining:</span>{' '}
                        <span style={{ fontFamily: 'var(--font-code)', color: 'var(--accent-rose)' }}>{formatTime(contest.remainingTime)}</span>
                      </div>
                      <Link href={`/client/contests/${contest.id}`}>
                        <Button variant="primary" className="btn-sm">Enter Arena</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 'var(--space-xl)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--bg-primary)' }}>
              <Trophy size={32} style={{ margin: '0 auto var(--space-sm)', color: 'var(--border-default)' }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No active contests at the moment.</p>
              <Link href="/client/contests">
                <Button variant="ghost" style={{ marginTop: 'var(--space-sm)', color: 'var(--accent-cyan)' }}>View Upcoming</Button>
              </Link>
            </div>
          )}
        </Card>

        <Card>
          <div className="card-header">
            <h2 className="card-title">Recent Submissions</h2>
            <Link href="/client/submissions" style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)' }}>View All</Link>
          </div>
          
          {userSubmissions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {userSubmissions.slice(0, 4).map(sub => (
                <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sub.status === 'accepted' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}></div>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{sub.questionId}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatDate(sub.submittedAt)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-code)' }}>{sub.language}</span>
                    <Badge status={sub.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
              No submissions yet. Start practicing!
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
