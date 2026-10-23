'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import {
  assignmentLabel,
  bulkManageQuestions,
  fetchAdminQuestions,
  questionContests,
} from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import { Search } from 'lucide-react';

function summarize(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return 'No description';
  return value.length > 120 ? `${value.slice(0, 117)}…` : value;
}

export default function AdminPractice() {
  const [questions, setQuestions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [addIds, setAddIds] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirm, setConfirm] = useState(null);

  async function load() {
    const next = await fetchAdminQuestions();
    setQuestions(next);
    setSelectedIds((current) => current.filter((id) => next.some((question) => question.id === id && question.isPractice && !question.archived)));
    setAddIds((current) => current.filter((id) => next.some((question) => question.id === id && !question.isPractice && !question.archived)));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchAdminQuestions();
        if (!cancelled) setQuestions(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load Practice Arena.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const practiceQuestions = useMemo(() => questions.filter((question) => question.isPractice && !question.archived), [questions]);
  const filtered = practiceQuestions.filter((question) => {
    const haystack = `${question.title} ${question.description || ''}`.toLowerCase();
    const matchesSearch = !searchTerm.trim() || haystack.includes(searchTerm.trim().toLowerCase());
    const matchesDifficulty = difficultyFilter === 'all' || question.difficulty === difficultyFilter;
    return matchesSearch && matchesDifficulty;
  });
  const candidates = questions.filter((question) => {
    if (question.isPractice || question.archived) return false;
    const haystack = `${question.title} ${question.description || ''}`.toLowerCase();
    return !candidateSearch.trim() || haystack.includes(candidateSearch.trim().toLowerCase());
  });

  const emptyMessage = questions.length === 0
    ? 'No questions in the Question Bank.'
    : practiceQuestions.length === 0
      ? 'No questions assigned to Practice Arena.'
      : 'No questions match this search.';

  async function runConfirm() {
    if (!confirm) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await confirm.run();
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update Practice Arena.');
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  }

  async function addSelected() {
    if (addIds.length === 0 || saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await bulkManageQuestions({ action: 'add-practice', questionIds: addIds });
      setSuccess(addIds.length === 1 ? 'Question added to Practice Arena.' : 'Questions added to Practice Arena.');
      setAddIds([]);
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to add questions.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>Practice Arena</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
            Choose which Question Bank problems students can practice. Removing a question here does not delete it or change contest assignments.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowAdd((open) => !open)}>Add questions</Button>
      </div>

      {error ? <p style={{ color: 'var(--accent-rose)', marginBottom: 'var(--space-md)' }}>{error}</p> : null}
      {success ? <p style={{ color: 'var(--accent-emerald)', marginBottom: 'var(--space-md)' }}>{success}</p> : null}

      {showAdd ? (
        <Card style={{ marginBottom: 'var(--space-lg)' }}>
          <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Add from Question Bank</h2>
          <input className="form-input" placeholder="Search questions..." value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} style={{ marginBottom: 'var(--space-md)' }} />
          {candidates.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>
              {questions.length === 0 ? 'No questions in the Question Bank.' : 'No questions are available to add.'}
            </p>
          ) : (
            <ul style={{ display: 'grid', gap: 'var(--space-sm)', maxHeight: 320, overflow: 'auto' }}>
              {candidates.map((question) => (
                <li key={question.id}>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={addIds.includes(question.id)}
                      onChange={() => setAddIds((current) => (
                        current.includes(question.id)
                          ? current.filter((id) => id !== question.id)
                          : [...current, question.id]
                      ))}
                    />
                    <span>
                      <strong>{question.title}</strong>
                      <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{assignmentLabel(question)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 'var(--space-md)' }}>
            <Button type="button" variant="primary" disabled={saving || addIds.length === 0} onClick={addSelected}>
              {saving ? 'Adding…' : `Add selected${addIds.length ? ` (${addIds.length})` : ''}`}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
          <div style={{ position: 'relative', width: 280, maxWidth: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: 36 }} placeholder="Search practice questions..." value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
          </div>
          <select className="form-select" value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}>
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        {selectedIds.length > 0 ? (
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setConfirm({
                title: 'Remove from Practice Arena?',
                body: 'The selected questions stay in the Question Bank and on any contests. Students will no longer see them in Practice Arena.',
                run: async () => {
                  await bulkManageQuestions({ action: 'remove-practice', questionIds: selectedIds });
                  setSuccess('Questions removed from Practice Arena.');
                  setSelectedIds([]);
                },
              })}
            >
              Remove selected ({selectedIds.length})
            </Button>
          </div>
        ) : null}
        {loading ? <p style={{ color: 'var(--accent-cyan)' }}>Loading Practice Arena…</p> : null}
        {!loading && filtered.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>{emptyMessage}</p> : null}
        {!loading && filtered.length > 0 ? (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Title</th>
                  <th>Difficulty</th>
                  <th>Also assigned</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((question) => {
                  const contests = questionContests(question);
                  return (
                    <tr key={question.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${question.title}`}
                          checked={selectedIds.includes(question.id)}
                          onChange={() => setSelectedIds((current) => (
                            current.includes(question.id)
                              ? current.filter((id) => id !== question.id)
                              : [...current, question.id]
                          ))}
                        />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{question.title}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{summarize(question.description)}</div>
                      </td>
                      <td><Badge status={question.difficulty} /></td>
                      <td>
                        {contests.length === 0 ? 'Not in a contest' : contests.map((contest) => (
                          <div key={contest.id}><Link href={`/admin/contests/${contest.id}`}>{contest.title}</Link></div>
                        ))}
                      </td>
                      <td>
                        <Link href={`/admin/questions#${question.id}`}>Edit in Question Bank</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      {confirm ? (
        <div role="dialog" aria-modal="true" aria-labelledby="practice-confirm-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, padding: 'var(--space-md)' }}>
          <div className="card" style={{ maxWidth: 480, width: '100%' }}>
            <h2 id="practice-confirm-title" style={{ fontSize: '1.15rem', marginBottom: 'var(--space-sm)' }}>{confirm.title}</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>{confirm.body}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <Button type="button" variant="ghost" disabled={saving} onClick={() => setConfirm(null)}>Cancel</Button>
              <Button type="button" variant="primary" disabled={saving} onClick={runConfirm}>{saving ? 'Working…' : 'Remove'}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
