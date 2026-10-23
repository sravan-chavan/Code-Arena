'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import TestCasePanel from '@/components/ui/TestCasePanel';
import { formatDate } from '@/lib/mockData';
import {
  archiveAdminQuestion,
  bulkManageQuestions,
  createAdminLibraryQuestion,
  deleteAdminQuestion,
  fetchAdminContests,
  fetchAdminQuestions,
  questionContests,
  updateAdminQuestion,
  updateQuestionPlacement,
} from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import { Plus, Search } from 'lucide-react';

const PAGE_SIZE = 20;

const emptyQuestion = {
  contestIds: [],
  includeInPractice: false,
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
  { id: 'contest', label: 'Contests' },
  { id: 'both', label: 'Both' },
  { id: 'archived', label: 'Archived' },
];

function summarize(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return 'No description';
  return value.length > 140 ? `${value.slice(0, 137)}…` : value;
}

function languageLine(question) {
  if (!Array.isArray(question.languages) || question.languages.length === 0) return 'Platform languages';
  return question.languages.map((language) => language.label || language.slug).join(', ');
}

function matchesAssignment(question, filter) {
  if (filter === 'all') return true;
  if (filter === 'archived') return Boolean(question.archived) || question.assignment === 'archived';
  if (question.archived || question.assignment === 'archived') return false;
  return question.assignment === filter;
}

function matchesSearch(question, term) {
  if (!term) return true;
  const haystack = [
    question.title,
    question.description,
    question.constraints,
    question.inputFormat,
    question.outputFormat,
  ].join(' ').toLowerCase();
  return haystack.includes(term.toLowerCase());
}

function createdMessage(form) {
  const contestCount = form.contestIds.length;
  if (form.includeInPractice && contestCount > 0) {
    return 'Question created in Practice Arena and the selected contests.';
  }
  if (form.includeInPractice) return 'Question created in Practice Arena.';
  if (contestCount > 1) return 'Question created and assigned to the selected contests.';
  if (contestCount === 1) return 'Question created and assigned to the selected contest.';
  return 'Unassigned question created.';
}

export default function AdminQuestions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');
  const [assignmentFilter, setAssignmentFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [questions, setQuestions] = useState([]);
  const [contests, setContests] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkContestIds, setBulkContestIds] = useState([]);
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
  const [placement, setPlacement] = useState({ includeInPractice: false, contestIds: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirm, setConfirm] = useState(null);
  const openedHash = useRef(false);

  async function load() {
    try {
      const [nextQuestions, nextContests] = await Promise.all([
        fetchAdminQuestions(),
        fetchAdminContests(),
      ]);
      setQuestions(nextQuestions);
      setContests(nextContests);
      setSelectedIds((current) => current.filter((id) => (
        nextQuestions.some((question) => question.id === id && !question.archived)
      )));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load questions.');
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

  const filteredQuestions = useMemo(() => questions.filter((question) => (
    matchesSearch(question, searchTerm.trim())
    && (difficultyFilter === 'all' || question.difficulty === difficultyFilter)
    && matchesAssignment(question, assignmentFilter)
  )), [questions, searchTerm, difficultyFilter, assignmentFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredQuestions.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleQuestions = filteredQuestions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visibleIds = visibleQuestions.filter((question) => !question.archived).map((question) => question.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

  useEffect(() => {
    setPage(1);
  }, [searchTerm, difficultyFilter, assignmentFilter]);

  useEffect(() => {
    if (loading || openedHash.current) return;
    const hash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    if (!hash) return;
    const question = questions.find((item) => item.id === hash);
    if (!question) return;
    openedHash.current = true;
    openEditor(question);
  }, [loading, questions]);

  function toggleId(list, id) {
    return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
  }

  function openEditor(question) {
    setEditingId(question.id);
    setEdit({
      title: question.title || '',
      description: question.description || '',
      inputFormat: question.inputFormat || '',
      outputFormat: question.outputFormat || '',
      constraints: question.constraints || '',
      difficulty: question.difficulty || 'easy',
    });
    setPlacement({
      includeInPractice: Boolean(question.isPractice) && !question.archived,
      contestIds: questionContests(question).map((contest) => contest.id),
    });
  }

  function startEdit(question) {
    if (editingId === question.id) {
      setEditingId('');
      return;
    }
    openEditor(question);
  }

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
        contestIds: form.contestIds,
        includeInPractice: form.includeInPractice,
        title: form.title,
        description: form.description,
        inputFormat: form.inputFormat,
        outputFormat: form.outputFormat,
        constraints: form.constraints,
        difficulty: form.difficulty,
        testCases,
      });
      setSuccess(createdMessage(form));
      setShowForm(false);
      setForm({ ...emptyQuestion, contestIds: form.contestIds, includeInPractice: form.includeInPractice });
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

  async function handleSavePlacement(event) {
    event.preventDefault();
    const question = questions.find((item) => item.id === editingId);
    if (!question) return;
    const original = new Set(questionContests(question).map((contest) => contest.id));
    const next = new Set(placement.contestIds);
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await updateQuestionPlacement(editingId, {
        includeInPractice: placement.includeInPractice,
        addContestIds: [...next].filter((id) => !original.has(id)),
        removeContestIds: [...original].filter((id) => !next.has(id)),
      });
      setPlacement({
        includeInPractice: Boolean(updated.isPractice),
        contestIds: questionContests(updated).map((contest) => contest.id),
      });
      setSuccess('Placement updated. The question content was left unchanged.');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update placement.');
    } finally {
      setSaving(false);
    }
  }

  function assignmentCell(question) {
    const contestsForQuestion = questionContests(question);
    if (question.archived || question.assignment === 'archived') {
      return (
        <div style={{ display: 'grid', gap: 4 }}>
          <span>Archived</span>
          {contestsForQuestion.map((contest) => (
            <Link key={contest.id} href={`/admin/contests/${contest.id}`}>{contest.title}</Link>
          ))}
        </div>
      );
    }
    if (!question.isPractice && contestsForQuestion.length === 0) return 'Unassigned';
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        {question.isPractice ? <span>Practice Arena</span> : null}
        {contestsForQuestion.map((contest) => (
          <Link key={contest.id} href={`/admin/contests/${contest.id}`}>{contest.title}</Link>
        ))}
      </div>
    );
  }

  function ask(next) {
    setError('');
    setSuccess('');
    setConfirm(next);
  }

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
      if (err instanceof ApiError && err.code === 'QUESTION_HAS_HISTORY' && confirm.question) {
        const question = confirm.question;
        setConfirm({
          title: `Archive “${question.title}”?`,
          body: `${err.message} Contests that already have submissions keep this question so scores stay intact.`,
          confirmLabel: 'Archive question',
          run: async () => {
            const result = await archiveAdminQuestion(question.id);
            const retained = result.retainedContestIds?.length || 0;
            setSuccess(retained > 0
              ? `Question archived. It remains on ${retained} contest${retained === 1 ? '' : 's'} that already have submissions.`
              : 'Question archived and removed from Practice Arena.');
          },
        });
      } else {
        setError(err instanceof ApiError ? err.message : 'Unable to complete that action.');
        setConfirm(null);
      }
    } finally {
      setSaving(false);
    }
  }

  function confirmBulk(action, title, body, successText) {
    if (selectedIds.length === 0) return;
    const needsContests = action === 'assign-contests' || action === 'unassign-contests';
    if (needsContests && bulkContestIds.length === 0) {
      setError('Select at least one contest for this action.');
      return;
    }
    ask({
      title,
      body,
      confirmLabel: 'Confirm',
      run: async () => {
        const result = await bulkManageQuestions({
          action,
          questionIds: selectedIds,
          contestIds: needsContests ? bulkContestIds : undefined,
        });
        const already = result.summary?.alreadyAssigned?.length || 0;
        setSuccess(already > 0 ? `${successText} ${already} assignment${already === 1 ? ' was' : 's were'} already in place.` : successText);
        setSelectedIds([]);
      },
    });
  }

  const emptyMessage = questions.length === 0
    ? 'No questions in the Question Bank.'
    : searchTerm.trim()
      ? 'No questions match this search.'
      : 'No questions match this filter.';

  return (
    <div className="space-y-6">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, background: 'linear-gradient(135deg, var(--text-primary), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-display)' }}>Question Bank</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Manage coding problems, contest assignments, and Practice Arena membership.</p>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.includeInPractice}
                onChange={(event) => setForm({ ...form, includeInPractice: event.target.checked })}
              />
              Add to Practice Arena
            </label>
            <div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Contests</p>
              {contests.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No contests are available.</p>
              ) : (
                <div style={{ display: 'grid', gap: 6, maxHeight: 180, overflow: 'auto' }}>
                  {contests.map((contest) => (
                    <label key={contest.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={form.contestIds.includes(contest.id)}
                        onChange={() => setForm({ ...form, contestIds: toggleId(form.contestIds, contest.id) })}
                      />
                      {contest.title}
                    </label>
                  ))}
                </div>
              )}
              {form.contestIds.length === 0 && !form.includeInPractice ? (
                <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>This question will stay in the Question Bank with no assignment.</p>
              ) : null}
            </div>
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
            <div style={{ position: 'relative', width: '260px', maxWidth: '100%' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="form-input" style={{ paddingLeft: '36px' }} placeholder="Search title or statement..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <select className="form-select" value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}>
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        {selectedIds.length > 0 ? (
          <div style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', padding: 'var(--space-md)', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
            <strong>{selectedIds.length} selected</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {contests.map((contest) => (
                <label key={contest.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={bulkContestIds.includes(contest.id)}
                    onChange={() => setBulkContestIds((current) => toggleId(current, contest.id))}
                  />
                  {contest.title}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button type="button" variant="primary" className="btn-sm" disabled={saving} onClick={() => confirmBulk('assign-contests', 'Assign selected questions?', 'The selected questions will be added to the checked contests. Questions already on a contest stay there once.', 'Questions assigned.')}>Assign to contests</Button>
              <Button type="button" variant="secondary" className="btn-sm" disabled={saving} onClick={() => confirmBulk('unassign-contests', 'Remove contest assignments?', 'This removes the selected questions from the checked contests. Questions with submissions on a contest stay assigned, and nothing else is changed if any removal is blocked. The questions remain in the Question Bank.', 'Contest assignments removed.')}>Remove contest assignments</Button>
              <Button type="button" variant="secondary" className="btn-sm" disabled={saving} onClick={() => confirmBulk('add-practice', 'Add to Practice Arena?', 'Selected questions will become available to students in Practice Arena. Contest assignments stay as they are.', 'Questions added to Practice Arena.')}>Add to Practice Arena</Button>
              <Button type="button" variant="ghost" className="btn-sm" disabled={saving} onClick={() => confirmBulk('remove-practice', 'Remove from Practice Arena?', 'Students will no longer see these questions in Practice Arena. The questions and their contest assignments stay in the Question Bank.', 'Questions removed from Practice Arena.')}>Remove from Practice Arena</Button>
            </div>
          </div>
        ) : null}

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Select questions on this page"
                    checked={allVisibleSelected}
                    onChange={() => {
                      setSelectedIds((current) => (
                        allVisibleSelected
                          ? current.filter((id) => !visibleIds.includes(id))
                          : [...new Set([...current, ...visibleIds])]
                      ));
                    }}
                  />
                </th>
                <th>Title</th>
                <th>Assignment</th>
                <th>Difficulty</th>
                <th>Languages</th>
                <th>Test Cases</th>
                <th>Points</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>Loading questions…</td></tr>
              ) : visibleQuestions.length > 0 ? visibleQuestions.map((question) => (
                <Fragment key={question.id}>
                  <tr>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${question.title}`}
                        checked={selectedIds.includes(question.id)}
                        disabled={Boolean(question.archived)}
                        onChange={() => setSelectedIds((current) => toggleId(current, question.id))}
                      />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{question.title}</div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>{summarize(question.description)}</div>
                      <div style={{ fontFamily: 'var(--font-code)', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>{question.id}</div>
                    </td>
                    <td>{assignmentCell(question)}</td>
                    <td><Badge status={question.difficulty} /></td>
                    <td style={{ fontSize: '0.8rem', maxWidth: 180 }}>{languageLine(question)}</td>
                    <td>{question.testCases?.filter((testCase) => !testCase.isHidden).length || 0} public, {question.testCases?.filter((testCase) => testCase.isHidden).length || 0} hidden</td>
                    <td>{question.totalPoints ?? 0}</td>
                    <td>{formatDate(question.createdAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Button type="button" variant="secondary" className="btn-sm" onClick={() => startEdit(question)}>
                          {editingId === question.id ? 'Close' : 'Edit'}
                        </Button>
                        {question.archived ? null : (
                          <Button
                            type="button"
                            variant="ghost"
                            className="btn-sm"
                            disabled={saving}
                            onClick={() => ask({
                              title: `Delete “${question.title}”?`,
                              body: 'If this question has no submissions or contest history, it will be permanently deleted. Otherwise you can archive it. Archive keeps historical submissions and removes the question from Practice Arena.',
                              confirmLabel: 'Delete question',
                              question,
                              run: () => deleteAdminQuestion(question.id).then(() => {
                                setSuccess('Question deleted.');
                                setSelectedIds((current) => current.filter((id) => id !== question.id));
                              }),
                            })}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {editingId === question.id ? (
                    <tr>
                      <td colSpan="9">
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
                        {question.archived ? (
                          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
                            This question is archived. It is hidden from Practice Arena. Contest links that already have submissions were kept.
                          </p>
                        ) : (
                          <form onSubmit={handleSavePlacement} style={{ display: 'grid', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                            <h3 style={{ fontSize: '1rem' }}>Placement</h3>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <input
                                type="checkbox"
                                checked={placement.includeInPractice}
                                onChange={(event) => setPlacement({ ...placement, includeInPractice: event.target.checked })}
                              />
                              Practice Arena
                            </label>
                            {contests.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No contests are available.</p> : (
                              <div style={{ display: 'grid', gap: 6 }}>
                                {contests.map((contest) => (
                                  <label key={contest.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <input
                                      type="checkbox"
                                      checked={placement.contestIds.includes(contest.id)}
                                      onChange={() => setPlacement({
                                        ...placement,
                                        contestIds: toggleId(placement.contestIds, contest.id),
                                      })}
                                    />
                                    {contest.title}
                                  </label>
                                ))}
                              </div>
                            )}
                            <Button type="submit" variant="secondary" disabled={saving}>{saving ? 'Saving…' : 'Save placement'}</Button>
                          </form>
                        )}
                        <TestCasePanel questionId={question.id} totalPoints={question.totalPoints} onChanged={load} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )) : (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: 'var(--space-xl)' }}>{emptyMessage}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredQuestions.length > PAGE_SIZE ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-md)' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Page {currentPage} of {pageCount}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button type="button" variant="ghost" className="btn-sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
              <Button type="button" variant="ghost" className="btn-sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      </Card>

      {confirm ? (
        <div role="dialog" aria-modal="true" aria-labelledby="question-confirm-title" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40, padding: 'var(--space-md)' }}>
          <div className="card" style={{ maxWidth: 520, width: '100%' }}>
            <h2 id="question-confirm-title" style={{ fontSize: '1.15rem', marginBottom: 'var(--space-sm)' }}>{confirm.title}</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>{confirm.body}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <Button type="button" variant="ghost" disabled={saving} onClick={() => setConfirm(null)}>Cancel</Button>
              <Button type="button" variant="primary" disabled={saving} onClick={runConfirm}>{saving ? 'Working…' : confirm.confirmLabel}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
