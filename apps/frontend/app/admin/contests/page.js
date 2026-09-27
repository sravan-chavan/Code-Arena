'use client';
import { useState } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { contests, formatTime, formatDate } from '@/lib/mockData';
import { Plus, Search, Trophy, Edit, Trash2, Users, Play, Square } from 'lucide-react';

export default function AdminContests() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');

  const filteredContests = contests.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' || c.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, background: 'linear-gradient(135deg, var(--text-primary), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-display)' }}>Contest Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Create, monitor, and manage coding competitions.</p>
        </div>
        <Button variant="primary" className="btn-lg">
          <Plus size={18} /> Create New Contest
        </Button>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button 
              className={`btn btn-sm ${filter === 'all' ? 'btn-secondary' : 'btn-ghost'}`} 
              onClick={() => setFilter('all')}
              style={{ border: filter === 'all' ? '1px solid var(--border-hover)' : 'none' }}
            >All</button>
            <button 
              className={`btn btn-sm ${filter === 'running' ? 'btn-secondary' : 'btn-ghost'}`} 
              onClick={() => setFilter('running')}
              style={{ border: filter === 'running' ? '1px solid var(--accent-emerald)' : 'none' }}
            >Running</button>
            <button 
              className={`btn btn-sm ${filter === 'scheduled' ? 'btn-secondary' : 'btn-ghost'}`} 
              onClick={() => setFilter('scheduled')}
              style={{ border: filter === 'scheduled' ? '1px solid var(--accent-blue)' : 'none' }}
            >Scheduled</button>
            <button 
              className={`btn btn-sm ${filter === 'draft' ? 'btn-secondary' : 'btn-ghost'}`} 
              onClick={() => setFilter('draft')}
              style={{ border: filter === 'draft' ? '1px solid var(--text-muted)' : 'none' }}
            >Drafts</button>
          </div>
          
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search contests..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '36px', paddingBottom: '8px', paddingTop: '8px' }}
            />
          </div>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Contest Details</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Participants</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredContests.length > 0 ? filteredContests.map(contest => (
                <tr key={contest.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
                        <Trophy size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{contest.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{contest.questionIds.length} Questions</div>
                      </div>
                    </div>
                  </td>
                  <td><Badge status={contest.status} /></td>
                  <td>
                    <div style={{ fontSize: '0.85rem' }}>{contest.duration} mins</div>
                    {contest.status === 'running' && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', fontFamily: 'var(--font-code)' }}>{formatTime(contest.remainingTime)} left</div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      <Users size={14} /> {contest.participantIds.length} / {contest.maxParticipants}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{formatDate(contest.createdAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      {contest.status === 'running' ? (
                        <Button variant="ghost" className="btn-icon" style={{ color: 'var(--accent-amber)' }} title="Pause"><Square size={16} /></Button>
                      ) : (
                        <Button variant="ghost" className="btn-icon" style={{ color: 'var(--accent-emerald)' }} title="Start"><Play size={16} /></Button>
                      )}
                      <Button variant="ghost" className="btn-icon" style={{ color: 'var(--text-secondary)' }} title="Edit"><Edit size={16} /></Button>
                      <Button variant="ghost" className="btn-icon" style={{ color: 'var(--accent-rose)' }} title="Delete"><Trash2 size={16} /></Button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
                    No contests found matching your search.
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
