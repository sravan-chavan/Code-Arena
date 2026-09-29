'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { createAdminQuestion, fetchAdminContest, fetchAdminQuestions } from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import { ChevronLeft } from 'lucide-react';

const emptyQuestion = {
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

export default function AdminContestDetail() {
  const { id } = useParams();
  const [contest, setContest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [form, setForm] = useState(emptyQuestion);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setError('');
    try {
      const [nextContest, nextQuestions] = await Promise.all([
        fetchAdminContest(id),
        fetchAdminQuestions(id),
      ]);
      setContest(nextContest);
      setQuestions(nextQuestions);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load contest.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [nextContest, nextQuestions] = await Promise.all([
          fetchAdminContest(id),
          fetchAdminQuestions(id),
        ]);
        if (cancelled) return;
        setContest(nextContest);
        setQuestions(nextQuestions);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load contest.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  async function handleAdd(event) {
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
      await createAdminQuestion(id, {
        title: form.title,
        description: form.description,
        inputFormat: form.inputFormat,
        outputFormat: form.outputFormat,
        constraints: form.constraints,
        difficulty: form.difficulty,
        testCases,
      });
      setSuccess('Question added.');
      setForm(emptyQuestion);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to add question.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ padding: 'var(--space-xl)' }}>Loading contest…</p>;
  if (!contest) return <p style={{ padding: 'var(--space-xl)', color: 'var(--accent-rose)' }}>{error || 'Contest not found.'}</p>;

  return (
    <div className="space-y-6">
      <Link href="/admin/contests" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        <ChevronLeft size={16} /> All contests
      </Link>
      <div className="page-header">
        <h1>{contest.title}</h1>
        <p>{contest.description}</p>
        <Badge status={contest.status} />
      </div>
      {error ? <p style={{ color: 'var(--accent-rose)' }}>{error}</p> : null}
      {success ? <p style={{ color: 'var(--accent-emerald)' }}>{success}</p> : null}

      <Card>
        <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Questions</h2>
        {questions.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No questions yet.</p> : (
          <ul style={{ display: 'grid', gap: 'var(--space-sm)' }}>
            {questions.map((question) => (
              <li key={question.id} style={{ padding: 'var(--space-sm)', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
                <strong>{question.title}</strong>
                <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>{question.difficulty} · {question.testCases?.length || 0} tests</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Add question</h2>
        <form onSubmit={handleAdd} style={{ display: 'grid', gap: 'var(--space-md)' }}>
          <input className="form-input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <textarea className="form-input" placeholder="Problem statement" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <textarea className="form-input" placeholder="Input format" rows={2} value={form.inputFormat} onChange={(e) => setForm({ ...form, inputFormat: e.target.value })} />
          <textarea className="form-input" placeholder="Output format" rows={2} value={form.outputFormat} onChange={(e) => setForm({ ...form, outputFormat: e.target.value })} />
          <textarea className="form-input" placeholder="Constraints" rows={2} value={form.constraints} onChange={(e) => setForm({ ...form, constraints: e.target.value })} />
          <select className="form-select" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <textarea className="form-input" placeholder="Sample input" rows={2} value={form.sampleInput} onChange={(e) => setForm({ ...form, sampleInput: e.target.value })} />
          <textarea className="form-input" placeholder="Sample output" rows={2} value={form.sampleOutput} onChange={(e) => setForm({ ...form, sampleOutput: e.target.value })} required />
          <textarea className="form-input" placeholder="Hidden test input (optional)" rows={2} value={form.hiddenInput} onChange={(e) => setForm({ ...form, hiddenInput: e.target.value })} />
          <textarea className="form-input" placeholder="Hidden test output (optional)" rows={2} value={form.hiddenOutput} onChange={(e) => setForm({ ...form, hiddenOutput: e.target.value })} />
          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Add question'}</Button>
        </form>
      </Card>
    </div>
  );
}
