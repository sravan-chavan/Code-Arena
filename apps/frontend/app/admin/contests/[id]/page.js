'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ContestTimer from '@/components/ui/ContestTimer';
import TestCasePanel from '@/components/ui/TestCasePanel';
import { formatDateTime, isoToLocalInput, localInputToIso } from '@/lib/contestTime';
import {
  attachAdminQuestions,
  assignmentLabel,
  belongsToContest,
  cancelAdminContest,
  createAdminQuestion,
  endAdminContest,
  fetchAdminContest,
  fetchAdminParticipants,
  fetchAdminQuestions,
  questionContests,
  reorderAdminQuestions,
  scheduleAdminContest,
  updateAdminContest,
  updateAdminQuestion,
} from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import { ChevronDown, ChevronLeft, ChevronUp } from 'lucide-react';

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

const TABS = ['overview', 'problems', 'participants', 'lifecycle'];
const LIBRARY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'practice', label: 'Practice' },
  { id: 'assigned', label: 'Assigned' },
];

function questionFromRecord(question) {
  return {
    title: question.title || '',
    description: question.description || '',
    inputFormat: question.inputFormat || '',
    outputFormat: question.outputFormat || '',
    constraints: question.constraints || '',
    difficulty: question.difficulty || 'easy',
  };
}

export default function AdminContestDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState('overview');
  const [contest, setContest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [form, setForm] = useState(emptyQuestion);
  const [library, setLibrary] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryFilter, setLibraryFilter] = useState('all');
  const [librarySearch, setLibrarySearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showEditContest, setShowEditContest] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState('');
  const [questionEdit, setQuestionEdit] = useState(questionFromRecord(emptyQuestion));
  const [edit, setEdit] = useState({ title: '', description: '', startTime: '', endTime: '', durationMinutes: 60 });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setError('');
    const [nextContest, nextQuestions, nextParticipants, nextLibrary] = await Promise.all([
      fetchAdminContest(id),
      fetchAdminQuestions(id),
      fetchAdminParticipants(id),
      fetchAdminQuestions(),
    ]);
    setContest(nextContest);
    setQuestions(nextQuestions);
    setParticipants(nextParticipants);
    setLibrary(nextLibrary);
    setEdit({
      title: nextContest.title || '',
      description: nextContest.description || '',
      startTime: isoToLocalInput(nextContest.startTime),
      endTime: isoToLocalInput(nextContest.endTime),
      durationMinutes: nextContest.durationMinutes || 60,
    });
    setSelectedIds((current) => current.filter((questionId) => {
      const question = nextLibrary.find((row) => row.id === questionId);
      return question && !question.isPractice && !belongsToContest(question, id);
    }));
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Unable to load contest.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [load]);

  async function runAction(work, okMessage) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await work();
      setSuccess(okMessage);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed.');
    } finally {
      setSaving(false);
    }
  }

  const actions = contest?.allowedActions || [];
  const editable = contest?.editableFields || [];

  async function handleUpdate(event) {
    event.preventDefault();
    await runAction(async () => {
      const payload = {};
      if (editable.includes('title')) payload.title = edit.title;
      if (editable.includes('description')) payload.description = edit.description;
      if (editable.includes('durationMinutes')) payload.durationMinutes = Number(edit.durationMinutes) || 60;
      if (editable.includes('startTime')) {
        const startTime = localInputToIso(edit.startTime);
        if (startTime) payload.startTime = startTime;
      }
      if (editable.includes('endTime')) {
        const endTime = localInputToIso(edit.endTime);
        if (endTime) payload.endTime = endTime;
      }
      await updateAdminContest(id, payload);
      setShowEditContest(false);
    }, 'Contest updated.');
  }

  async function handleAdd(event) {
    event.preventDefault();
    await runAction(async () => {
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
      setForm(emptyQuestion);
    }, 'Question added.');
  }

  async function handleAttachSelected() {
    if (selectedIds.length === 0 || saving) return;
    await runAction(async () => {
      await attachAdminQuestions(id, selectedIds);
      setSelectedIds([]);
      setShowLibrary(false);
    }, selectedIds.length === 1 ? 'Question attached.' : 'Selected questions attached.');
  }

  function toggleSelected(questionId, disabled) {
    if (disabled) return;
    setSelectedIds((current) => (
      current.includes(questionId)
        ? current.filter((value) => value !== questionId)
        : [...current, questionId]
    ));
  }

  async function handleSaveQuestion(event) {
    event.preventDefault();
    if (!editingQuestionId) return;
    await runAction(async () => {
      await updateAdminQuestion(editingQuestionId, {
        title: questionEdit.title,
        description: questionEdit.description,
        inputFormat: questionEdit.inputFormat,
        outputFormat: questionEdit.outputFormat,
        constraints: questionEdit.constraints,
        difficulty: questionEdit.difficulty,
      });
    }, 'Question updated.');
  }

  async function moveQuestion(index, direction) {
    const next = questions.map((question) => question.id);
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await runAction(async () => {
      setQuestions(await reorderAdminQuestions(id, next));
    }, 'Problem order updated.');
  }

  const filteredLibrary = useMemo(() => {
    return library.filter((question) => {
      const matchesSearch = question.title.toLowerCase().includes(librarySearch.toLowerCase());
      if (!matchesSearch) return false;
      if (libraryFilter === 'unassigned') return question.assignment === 'unassigned' && !question.isPractice;
      if (libraryFilter === 'practice') return Boolean(question.isPractice);
      if (libraryFilter === 'assigned') return question.assignment === 'contest';
      return true;
    });
  }, [library, libraryFilter, librarySearch]);

  if (loading) return <p style={{ padding: 'var(--space-xl)' }}>Loading contest…</p>;
  if (!contest) return <p style={{ padding: 'var(--space-xl)', color: 'var(--accent-rose)' }}>{error || 'Contest not found.'}</p>;

  return (
    <div className="space-y-6">
      <Link href="/admin/contests" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
        <ChevronLeft size={16} /> All contests
      </Link>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-md)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h1>{contest.title}</h1>
          <p>{contest.description || 'No description.'}</p>
          <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge status={contest.status} />
            <ContestTimer contest={contest} onExpired={load} />
          </div>
        </div>
        {actions.includes('update') ? (
          <Button
            type="button"
            variant={showEditContest ? 'secondary' : 'primary'}
            onClick={() => setShowEditContest((open) => !open)}
          >
            {showEditContest ? 'Close editor' : 'Edit Contest'}
          </Button>
        ) : null}
      </div>
      {error ? <p style={{ color: 'var(--accent-rose)' }}>{error}</p> : null}
      {success ? <p style={{ color: 'var(--accent-emerald)' }}>{success}</p> : null}

      {showEditContest && actions.includes('update') ? (
        <Card>
          <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Edit Contest</h2>
          <form onSubmit={handleUpdate} style={{ display: 'grid', gap: 'var(--space-md)' }}>
            {editable.includes('title') ? (
              <input className="form-input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required />
            ) : null}
            {editable.includes('description') ? (
              <textarea className="form-input" rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            ) : null}
            {editable.includes('startTime') ? (
              <input className="form-input" type="datetime-local" value={edit.startTime} onChange={(e) => setEdit({ ...edit, startTime: e.target.value })} />
            ) : null}
            {editable.includes('durationMinutes') ? (
              <input className="form-input" type="number" min={1} value={edit.durationMinutes} onChange={(e) => setEdit({ ...edit, durationMinutes: e.target.value })} />
            ) : null}
            {editable.includes('endTime') ? (
              <input className="form-input" type="datetime-local" value={edit.endTime} onChange={(e) => setEdit({ ...edit, endTime: e.target.value })} />
            ) : null}
            {editable.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>This contest can no longer be edited.</p>
            ) : (
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save contest'}</Button>
                <Button type="button" variant="secondary" disabled={saving} onClick={() => setShowEditContest(false)}>Cancel</Button>
              </div>
            )}
          </form>
        </Card>
      ) : null}

      <div style={{ display: 'flex', gap: 'var(--space-sm)', borderBottom: '1px solid var(--border-default)' }}>
        {TABS.map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 16px',
              fontWeight: 600,
              textTransform: 'capitalize',
              borderBottom: tab === key ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              color: tab === key ? 'var(--accent-cyan)' : 'var(--text-secondary)',
            }}
          >
            {key}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <Card>
          <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Overview</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '8px 16px', fontSize: '0.9rem' }}>
            <dt style={{ color: 'var(--text-secondary)' }}>Status</dt>
            <dd style={{ textTransform: 'capitalize' }}>{contest.status}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Stored status</dt>
            <dd style={{ textTransform: 'capitalize' }}>{contest.storedStatus}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Start</dt>
            <dd>{formatDateTime(contest.startTime)}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>End</dt>
            <dd>{formatDateTime(contest.endTime)}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Duration</dt>
            <dd>{contest.durationMinutes} minutes</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Problems</dt>
            <dd>{contest.questionCount ?? questions.length}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Participants</dt>
            <dd>{contest.participantCount ?? participants.length}</dd>
            <dt style={{ color: 'var(--text-secondary)' }}>Server time</dt>
            <dd>{formatDateTime(contest.serverTime)}</dd>
          </dl>
        </Card>
      ) : null}

      {tab === 'problems' ? (
        <>
          <Card>
            <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Problems</h2>
            {questions.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No questions yet.</p> : (
              <ul style={{ display: 'grid', gap: 'var(--space-sm)' }}>
                {questions.map((question, index) => (
                  <li key={question.id} style={{ padding: 'var(--space-sm)', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-sm)' }}>
                      <div>
                        <strong>{index + 1}. {question.title}</strong>
                        <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>{question.difficulty} · {question.testCases?.length || 0} tests</span>
                        <div style={{ fontFamily: 'var(--font-code)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{question.id}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <Button
                          type="button"
                          variant="secondary"
                          className="btn-sm"
                          onClick={() => {
                            if (editingQuestionId === question.id) {
                              setEditingQuestionId('');
                              return;
                            }
                            setEditingQuestionId(question.id);
                            setQuestionEdit(questionFromRecord(question));
                          }}
                        >
                          {editingQuestionId === question.id ? 'Close' : 'Edit'}
                        </Button>
                        <Button type="button" variant="ghost" className="btn-sm" disabled={saving || index === 0} onClick={() => moveQuestion(index, -1)}>
                          <ChevronUp size={14} />
                        </Button>
                        <Button type="button" variant="ghost" className="btn-sm" disabled={saving || index === questions.length - 1} onClick={() => moveQuestion(index, 1)}>
                          <ChevronDown size={14} />
                        </Button>
                      </div>
                    </div>
                    {editingQuestionId === question.id ? (
                      <>
                        <form onSubmit={handleSaveQuestion} style={{ display: 'grid', gap: 'var(--space-md)', marginTop: 'var(--space-md)' }}>
                          <input className="form-input" value={questionEdit.title} onChange={(e) => setQuestionEdit({ ...questionEdit, title: e.target.value })} required />
                          <textarea className="form-input" rows={4} placeholder="Problem statement" value={questionEdit.description} onChange={(e) => setQuestionEdit({ ...questionEdit, description: e.target.value })} />
                          <textarea className="form-input" rows={2} placeholder="Input format" value={questionEdit.inputFormat} onChange={(e) => setQuestionEdit({ ...questionEdit, inputFormat: e.target.value })} />
                          <textarea className="form-input" rows={2} placeholder="Output format" value={questionEdit.outputFormat} onChange={(e) => setQuestionEdit({ ...questionEdit, outputFormat: e.target.value })} />
                          <textarea className="form-input" rows={2} placeholder="Constraints" value={questionEdit.constraints} onChange={(e) => setQuestionEdit({ ...questionEdit, constraints: e.target.value })} />
                          <select className="form-select" value={questionEdit.difficulty} onChange={(e) => setQuestionEdit({ ...questionEdit, difficulty: e.target.value })}>
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                          </select>
                          <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save question'}</Button>
                        </form>
                        <div style={{ marginTop: 'var(--space-md)' }}>
                          <TestCasePanel questionId={question.id} onChanged={load} />
                        </div>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <button
              type="button"
              onClick={() => setShowLibrary((open) => !open)}
              style={{
                display: 'flex',
                width: '100%',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'none',
                padding: 0,
                color: 'var(--text-primary)',
              }}
            >
              <h2 className="card-title">Add Questions</h2>
              <span style={{ color: 'var(--text-secondary)' }}>{showLibrary ? '▼' : '▶'}</span>
            </button>
            {showLibrary ? (
              <div style={{ marginTop: 'var(--space-md)', display: 'grid', gap: 'var(--space-md)' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Select existing Question Library problems. Questions already in this contest cannot be added again. Questions belonging to other contests remain selectable. Practice questions cannot be attached.
                </p>
                <input
                  className="form-input"
                  placeholder="Search questions..."
                  value={librarySearch}
                  onChange={(e) => setLibrarySearch(e.target.value)}
                />
                <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                  {LIBRARY_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      className={`btn btn-sm ${libraryFilter === filter.id ? 'btn-secondary' : 'btn-ghost'}`}
                      onClick={() => setLibraryFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                {filteredLibrary.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)' }}>No matching questions.</p>
                ) : (
                  <ul style={{ display: 'grid', gap: 'var(--space-sm)' }}>
                    {filteredLibrary.map((question) => {
                      const alreadyHere = belongsToContest(question, id);
                      const practice = Boolean(question.isPractice);
                      const blocked = practice || alreadyHere;
                      const contests = questionContests(question);
                      const selected = selectedIds.includes(question.id);
                      return (
                        <li key={question.id} style={{ padding: 'var(--space-sm)', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-sm)' }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, cursor: blocked ? 'not-allowed' : 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={blocked || saving}
                              onChange={() => toggleSelected(question.id, blocked)}
                            />
                            <div>
                              <strong>{question.title}</strong>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                {question.difficulty} · {assignmentLabel(question)}
                              </div>
                              {practice ? (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Practice</div>
                              ) : alreadyHere ? (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Already Added</div>
                              ) : contests.length > 0 ? (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  Assigned to: {contests.map((row) => row.title).join(', ')}
                                </div>
                              ) : (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Unassigned</div>
                              )}
                              <div style={{ fontFamily: 'var(--font-code)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{question.id}</div>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <Button
                  type="button"
                  variant="primary"
                  disabled={saving || selectedIds.length === 0}
                  onClick={handleAttachSelected}
                >
                  {saving ? 'Adding…' : `Add Selected Questions${selectedIds.length ? ` (${selectedIds.length})` : ''}`}
                </Button>
              </div>
            ) : (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: 'var(--space-md)' }}>
                Expand to attach existing library questions to this contest.
              </p>
            )}
          </Card>
          <Card>
            <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Create question</h2>
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
        </>
      ) : null}

      {tab === 'participants' ? (
        <Card>
          <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Participants</h2>
          {participants.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No registered students yet.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((participant) => (
                  <tr key={participant.id}>
                    <td>{participant.email}</td>
                    <td><Badge status={participant.status} /></td>
                    <td>{formatDateTime(participant.registeredAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}

      {tab === 'lifecycle' ? (
        <Card>
          <h2 className="card-title" style={{ marginBottom: 'var(--space-md)' }}>Lifecycle</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
            Only actions valid for the current server-side state are shown. Draft → Schedule, Scheduled → Cancel, Running → End.
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            {actions.includes('schedule') ? (
              <Button variant="primary" disabled={saving} onClick={() => runAction(() => scheduleAdminContest(id), 'Contest scheduled.')}>Schedule</Button>
            ) : null}
            {actions.includes('cancel') ? (
              <Button variant="secondary" disabled={saving} onClick={() => runAction(() => cancelAdminContest(id), 'Contest cancelled.')}>Cancel contest</Button>
            ) : null}
            {actions.includes('end') ? (
              <Button variant="secondary" disabled={saving} onClick={() => runAction(() => endAdminContest(id), 'Contest ended.')}>End contest</Button>
            ) : null}
            {actions.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No lifecycle actions available.</p> : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
