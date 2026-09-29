'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/mockData';
import { createAdminQuestion, fetchAdminContests, fetchAdminQuestions } from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import { Plus, Search } from 'lucide-react';

const emptyQuestion = {
  contestId: '',
  title: '',
  description: '',
  inputFormat: '',
  outputFormat: '',
  constraints: '',
  difficulty: 'easy',
  sampleInput: '',
  sampleOutput: '',
  hiddenInput: '',
  hiddenOutput: '',
};

export default function AdminQuestions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [questions, setQuestions] = useState([]);
  const [contests, setContests] = useState([]);
  const [form, setForm] = useState(emptyQuestion);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    setError('');
    try {
      const [nextQuestions, nextContests] = await Promise.all([
        fetchAdminQuestions(),
        fetchAdminContests(),
      ]);
      setQuestions(nextQuestions);
      setContests(nextContests);
      setForm((current) => ({ ...current, contestId: current.contestId || nextContests[0]?.id || '' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load questions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextQuestions, nextContests] = await Promise.all([
          fetchAdminQuestions(),
          fetchAdminContests(),
        ]);
        if (cancelled) return;
        setQuestions(nextQuestions);
        setContests(nextContests);
        setForm((current) => ({ ...current, contestId: current.contestId || nextContests[0]?.id || '' }));
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load questions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredQuestions = questions.filter((question) => {
    const matchesSearch = question.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = difficultyFilter === 'all' || question.difficulty === difficultyFilter;
    return matchesSearch && matchesFilter;
  });

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const testCases = [
        { stdin: form.sampleInput, expectedOutput: form.sampleOutput, isHidden: false },
      ];
      if (form.hiddenInput || form.hiddenOutput) {
        testCases.push({ stdin: form.hiddenInput, expectedOutput: form.hiddenOutput, isHidden: true });
      }
      await createAdminQuestion(form.contestId, {
        title: form.title,
        description: form.description,
        inputFormat: form.inputFormat,
        outputFormat: form.outputFormat,
        constraints: form.constraints,
        difficulty: form.difficulty,
        testCases,
      });
      setSuccess('Question created.');
      setShowForm(false);
      setForm({ ...emptyQuestion, contestId: form.contestId });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create question.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, background: 'linear-gradient(135deg, var(--text-primary), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-display)' }}>Question Bank</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Manage coding problems and test cases.</p>
        </div>
        <Button variant="primary" className="btn-lg" onClick={() => setShowForm((open) => !open)}>
          <Plus size={18} /> Create Question
        </Button>
      </div>

      {error ? <p style={{ color: 'var(--accent-rose)' }}>{error}</p> : null}
      {success ? <p style={{ color: 'var(--accent-emerald)' }}>{success}</p> : null}

      {showForm ? (
        <Card>
          <form onSubmit={handleCreate} style={{ display: 'grid', gap: 'var(--space-md)' }}>
            <select className="form-select" value={form.contestId} onChange={(e) => setForm({ ...form, contestId: e.target.value })} required>
              <option value="">Select contest</option>
              {contests.map((contest) => (
                <option key={contest.id} value={contest.id}>{contest.title}</option>
              ))}
            </select>
            <input className="form-input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <textarea className="form-input" placeholder="Problem statement" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <select className="form-select" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
            <textarea className="form-input" placeholder="Sample input" rows={2} value={form.sampleInput} onChange={(e) => setForm({ ...form, sampleInput: e.target.value })} />
            <textarea className="form-input" placeholder="Sample output" rows={2} value={form.sampleOutput} onChange={(e) => setForm({ ...form, sampleOutput: e.target.value })} required />
            <Button type="submit" variant="primary" disabled={saving || !form.contestId}>{saving ? 'Saving…' : 'Save question'}</Button>
          </form>
        </Card>
      ) : null}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
          <div style={{ position: 'relative', width: '300px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: '36px' }} placeholder="Search questions..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <select className="form-select" value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}>
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Contest</th>
                <th>Difficulty</th>
                <th>Test Cases</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>Loading questions…</td></tr>
              ) : filteredQuestions.length > 0 ? filteredQuestions.map((question) => (
                <tr key={question.id}>
                  <td style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{question.title}</td>
                  <td>
                    <Link href={`/admin/contests/${question.contestId}`}>{question.contestTitle}</Link>
                  </td>
                  <td><Badge status={question.difficulty} /></td>
                  <td>{question.testCases?.filter((t) => !t.isHidden).length || 0} public, {question.testCases?.filter((t) => t.isHidden).length || 0} hidden</td>
                  <td>{formatDate(question.createdAt)}</td>
                </tr>
              )) : (
                <tr><td colSpan="5" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>No questions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
