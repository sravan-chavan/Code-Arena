'use client';
import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import TestCasePanel from '@/components/ui/TestCasePanel';
import { formatDate } from '@/lib/mockData';
import {
  createAdminLibraryQuestion,
  fetchAdminContests,
  fetchAdminQuestions,
  questionContests,
  updateAdminQuestion,
} from '@/lib/contestsApi';
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

const ASSIGNMENT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'practice', label: 'Practice' },
  { id: 'assigned', label: 'Assigned' },
];

export default function AdminQuestions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [questions, setQuestions] = useState([]);
  const [contests, setContests] = useState([]);
  const [form, setForm] = useState(emptyQuestion);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [edit, setEdit] = useState({
    title: '',
    description: '',
    inputFormat: '',
    outputFormat: '',
    constraints: '',
    difficulty: 'easy',
  });
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
    const matchesDifficulty = difficultyFilter === 'all' || question.difficulty === difficultyFilter;
    const matchesAssignment = assignmentFilter === 'all'
      || (assignmentFilter === 'practice' && question.isPractice)
      || (assignmentFilter === 'unassigned' && question.assignment === 'unassigned' && !question.isPractice)
      || (assignmentFilter === 'assigned' && question.assignment === 'contest');
    return matchesSearch && matchesDifficulty && matchesAssignment;
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
      await createAdminLibraryQuestion({
        contestId: form.contestId || null,
        title: form.title,
        description: form.description,
        inputFormat: form.inputFormat,
        outputFormat: form.outputFormat,
        constraints: form.constraints,
        difficulty: form.difficulty,
        testCases,
      });
      setSuccess(form.contestId ? 'Question created.' : 'Unassigned question created.');
      setShowForm(false);
      setForm({ ...emptyQuestion, contestId: form.contestId });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create question.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateAdminQuestion(editingId, {
        title: edit.title,
        description: edit.description,
        inputFormat: edit.inputFormat,
        outputFormat: edit.outputFormat,
        constraints: edit.constraints,
        difficulty: edit.difficulty,
      });
      setSuccess('Question updated.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update question.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(question) {
    if (editingId === question.id) {
      setEditingId('');
      return;
    }
    setEditingId(question.id);
    setEdit({
      title: question.title || '',
      description: question.description || '',
      inputFormat: question.inputFormat || '',
      outputFormat: question.outputFormat || '',
      constraints: question.constraints || '',
      difficulty: question.difficulty || 'easy',
    });
  }

  function assignmentCell(question) {
    if (question.isPractice || question.assignment === 'practice') {
      return 'Practice';
    }
    const contests = questionContests(question);
    if (contests.length === 0) {
      return 'Unassigned';
    }
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {contests.length === 1 ? 'Assigned to' : `Assigned to ${contests.length} contests`}
        </span>
        {contests.map((contest) => (
          <Link key={contest.id} href={`/admin/contests/${contest.id}`}>{contest.title}</Link>
        ))}
      </div>
    );
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
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Contest</label>
            <select className="form-select" value={form.contestId} onChange={(e) => setForm({ ...form, contestId: e.target.value })}>
              <option value="">No Contest / Unassigned</option>
              {contests.map((contest) => (
                <option key={contest.id} value={contest.id}>{contest.title}</option>
              ))}
            </select>
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
            <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save question'}</Button>
          </form>
        </Card>
      ) : null}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            {ASSIGNMENT_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`btn btn-sm ${assignmentFilter === filter.id ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setAssignmentFilter(filter.id)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '260px' }}>
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
        </div>
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>ID</th>
                <th>Assignment</th>
                <th>Difficulty</th>
                <th>Test Cases</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>Loading questions…</td></tr>
              ) : filteredQuestions.length > 0 ? filteredQuestions.map((question) => (
                <Fragment key={question.id}>
                  <tr>
                    <td style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{question.title}</td>
                    <td style={{ fontFamily: 'var(--font-code)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{question.id}</td>
                    <td>{assignmentCell(question)}</td>
                    <td><Badge status={question.difficulty} /></td>
                    <td>{question.testCases?.filter((t) => !t.isHidden).length || 0} public, {question.testCases?.filter((t) => t.isHidden).length || 0} hidden</td>
                    <td>{formatDate(question.createdAt)}</td>
                    <td>
                      <Button type="button" variant="secondary" className="btn-sm" onClick={() => startEdit(question)}>
                        {editingId === question.id ? 'Close' : 'Edit'}
                      </Button>
                    </td>
                  </tr>
                  {editingId === question.id ? (
                    <tr>
                      <td colSpan="7">
                        <form onSubmit={handleSaveEdit} style={{ display: 'grid', gap: 'var(--space-md)', padding: 'var(--space-md) 0' }}>
                          <input className="form-input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required />
                          <textarea className="form-input" rows={4} placeholder="Problem statement" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                          <textarea className="form-input" rows={2} placeholder="Input format" value={edit.inputFormat} onChange={(e) => setEdit({ ...edit, inputFormat: e.target.value })} />
                          <textarea className="form-input" rows={2} placeholder="Output format" value={edit.outputFormat} onChange={(e) => setEdit({ ...edit, outputFormat: e.target.value })} />
                          <textarea className="form-input" rows={2} placeholder="Constraints" value={edit.constraints} onChange={(e) => setEdit({ ...edit, constraints: e.target.value })} />
                          <select className="form-select" value={edit.difficulty} onChange={(e) => setEdit({ ...edit, difficulty: e.target.value })}>
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                          </select>
                          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save question'}</Button>
                        </form>
                        <TestCasePanel questionId={question.id} onChanged={load} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )) : (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>No questions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
