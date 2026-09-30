'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/mockData';
import { formatDateTime, localInputToIso } from '@/lib/contestTime';
import { createAdminContest, fetchAdminContests } from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import { Plus, Search, Trophy } from 'lucide-react';

const emptyForm = { title: '', description: '', startTime: '', durationMinutes: 60, endTime: '' };

export default function AdminContests() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  async function load() {
    setError('');
    try {
      setContests(await fetchAdminContests());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load contests.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchAdminContests();
        if (!cancelled) setContests(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load contests.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredContests = contests.filter((contest) => {
    const matchesSearch = contest.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'all' || contest.status === filter;
    return matchesSearch && matchesFilter;
  });

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body = {
        title: form.title,
        description: form.description,
        durationMinutes: Number(form.durationMinutes) || 60,
      };
      const startTime = localInputToIso(form.startTime);
      const endTime = localInputToIso(form.endTime);
      if (startTime) body.startTime = startTime;
      if (endTime) body.endTime = endTime;
      const created = await createAdminContest(body);
      setSuccess(`Created draft contest “${created.title}”.`);
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create contest.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, background: 'linear-gradient(135deg, var(--text-primary), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-display)' }}>Contest Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Create, schedule, and manage coding competitions.</p>
        </div>
        <Button variant="primary" className="btn-lg" onClick={() => setShowForm((open) => !open)}>
          <Plus size={18} /> Create New Contest
        </Button>
      </div>

      {error ? <p style={{ color: 'var(--accent-rose)' }}>{error}</p> : null}
      {success ? <p style={{ color: 'var(--accent-emerald)' }}>{success}</p> : null}

      {showForm ? (
        <Card>
          <form onSubmit={handleCreate} style={{ display: 'grid', gap: 'var(--space-md)' }}>
            <div className="form-group">
              <label>Title</label>
              <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={120} />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Start time (local)</label>
              <input className="form-input" type="datetime-local" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Duration (minutes)</label>
              <input className="form-input" type="number" min={1} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
            </div>
            <div className="form-group">
              <label>End time (local, optional — overrides duration)</label>
              <input className="form-input" type="datetime-local" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Times are converted to UTC for the API. The contest is saved as a draft until you schedule it.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Creating…' : 'Save contest'}</Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            {['all', 'draft', 'scheduled', 'running', 'ended', 'cancelled'].map((value) => (
              <button
                key={value}
                className={`btn btn-sm ${filter === value ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setFilter(value)}
              >{value === 'all' ? 'All' : value[0].toUpperCase() + value.slice(1)}</button>
            ))}
          </div>
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input type="text" placeholder="Search contests..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="form-input" style={{ paddingLeft: '36px' }} />
          </div>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Contest Details</th>
                <th>Status</th>
                <th>Start</th>
                <th>End</th>
                <th>Problems</th>
                <th>Participants</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>Loading contests…</td></tr>
              ) : filteredContests.length > 0 ? filteredContests.map((contest) => (
                <tr key={contest.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
                        <Trophy size={20} />
                      </div>
                      <div>
                        <Link href={`/admin/contests/${contest.id}`} style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{contest.title}</Link>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatDate(contest.createdAt)}</div>
                      </div>
                    </div>
                  </td>
                  <td><Badge status={contest.status} /></td>
                  <td style={{ fontSize: '0.85rem' }}>{formatDateTime(contest.startTime)}</td>
                  <td style={{ fontSize: '0.85rem' }}>{formatDateTime(contest.endTime)}</td>
                  <td>{contest.questionCount ?? 0}</td>
                  <td>{contest.participantCount ?? 0}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
                    No contests found.
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
