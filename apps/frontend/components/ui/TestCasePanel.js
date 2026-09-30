'use client';
import { useCallback, useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import {
  createAdminTestCase,
  deleteAdminTestCase,
  fetchAdminTestCases,
  updateAdminTestCase,
} from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';

const emptyDraft = { stdin: '', expectedOutput: '', isHidden: true, points: '' };

function editFromRow(row) {
  return {
    stdin: row.stdin || '',
    expectedOutput: row.expectedOutput || '',
    isHidden: Boolean(row.isHidden),
    points: row.points === undefined || row.points === null ? '' : String(row.points),
  };
}

export default function TestCasePanel({ questionId, totalPoints, onChanged }) {
  const [open, setOpen] = useState(false);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [edits, setEdits] = useState({});

  const load = useCallback(async () => {
    if (!questionId) return;
    setLoading(true);
    setError('');
    try {
      const rows = await fetchAdminTestCases(questionId);
      setCases(rows);
      setEdits(Object.fromEntries(rows.map((row) => [row.id, editFromRow(row)])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load test cases.');
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => {
    if (open) {
      load();
    }
  }, [open, load]);

  const loadedTotal = cases.reduce((sum, row) => sum + Number(row.points || 0), 0);
  const displayedTotal = totalPoints === undefined || totalPoints === null ? loadedTotal : Number(totalPoints);

  async function run(work, okMessage) {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await work();
      setSuccess(okMessage);
      await load();
      if (onChanged) await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Test case request failed.');
    } finally {
      setSaving(false);
    }
  }

  function pointsPayload(value) {
    if (value === undefined || value === null || value === '') return {};
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed)) return {};
    return { points: parsed };
  }

  async function handleAdd(event) {
    event.preventDefault();
    if (!draft.expectedOutput) {
      setError('Expected output is required.');
      return;
    }
    await run(async () => {
      await createAdminTestCase(questionId, {
        stdin: draft.stdin,
        expectedOutput: draft.expectedOutput,
        isHidden: draft.isHidden,
        ...pointsPayload(draft.points),
      });
      setDraft(emptyDraft);
    }, 'Test case added.');
  }

  async function handleSave(testCaseId) {
    const edit = edits[testCaseId];
    if (!edit || !edit.expectedOutput) {
      setError('Expected output is required.');
      return;
    }
    await run(async () => {
      await updateAdminTestCase(questionId, testCaseId, {
        stdin: edit.stdin,
        expectedOutput: edit.expectedOutput,
        isHidden: edit.isHidden,
        ...pointsPayload(edit.points),
      });
    }, 'Test case updated.');
  }

  async function handleDelete(testCaseId) {
    await run(async () => {
      await deleteAdminTestCase(questionId, testCaseId);
    }, 'Test case deleted.');
  }

  async function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= cases.length) return;
    const current = cases[index];
    const swap = cases[target];
    await run(async () => {
      await updateAdminTestCase(questionId, current.id, { sortOrder: swap.sortOrder });
      await updateAdminTestCase(questionId, swap.id, { sortOrder: current.sortOrder });
    }, 'Test case order updated.');
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 'var(--space-md)' }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontWeight: 600,
          color: 'var(--text-primary)',
          background: 'none',
          padding: 0,
        }}
      >
        <span>{open ? '▼' : '▶'}</span> Test Cases
        {cases.length > 0 || displayedTotal ? (
          <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.8rem' }}>
            ({cases.length || 0} · {displayedTotal} pts)
          </span>
        ) : null}
      </button>
      {open ? (
        <div style={{ marginTop: 'var(--space-md)', display: 'grid', gap: 'var(--space-md)' }}>
          {error ? <p style={{ color: 'var(--accent-rose)' }}>{error}</p> : null}
          {success ? <p style={{ color: 'var(--accent-emerald)' }}>{success}</p> : null}
          {loading ? <p style={{ color: 'var(--text-secondary)' }}>Loading test cases…</p> : null}
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Question total: {displayedTotal} points (from persisted test cases)
          </p>
          {cases.map((testCase, index) => {
            const edit = edits[testCase.id] || emptyDraft;
            return (
              <div key={testCase.id} style={{ padding: 'var(--space-md)', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', display: 'grid', gap: 'var(--space-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>Test Case {index + 1} · {testCase.points} pts</strong>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Button type="button" variant="secondary" className="btn-sm" disabled={saving || index === 0} onClick={() => move(index, -1)}>Up</Button>
                    <Button type="button" variant="secondary" className="btn-sm" disabled={saving || index === cases.length - 1} onClick={() => move(index, 1)}>Down</Button>
                  </div>
                </div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Input</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={edit.stdin}
                  onChange={(event) => setEdits((current) => ({
                    ...current,
                    [testCase.id]: { ...edit, stdin: event.target.value },
                  }))}
                />
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Expected Output</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={edit.expectedOutput}
                  onChange={(event) => setEdits((current) => ({
                    ...current,
                    [testCase.id]: { ...edit, expectedOutput: event.target.value },
                  }))}
                  required
                />
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Points</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  value={edit.points}
                  onChange={(event) => setEdits((current) => ({
                    ...current,
                    [testCase.id]: { ...edit, points: event.target.value },
                  }))}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(edit.isHidden)}
                    onChange={(event) => setEdits((current) => ({
                      ...current,
                      [testCase.id]: { ...edit, isHidden: event.target.checked },
                    }))}
                  />
                  Hidden
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <Button type="button" variant="primary" className="btn-sm" disabled={saving} onClick={() => handleSave(testCase.id)}>
                    {saving ? 'Saving…' : 'Save test case'}
                  </Button>
                  <Button type="button" variant="secondary" className="btn-sm" disabled={saving} onClick={() => handleDelete(testCase.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
          <form onSubmit={handleAdd} style={{ display: 'grid', gap: 'var(--space-sm)', padding: 'var(--space-md)', border: '1px dashed var(--border-default)', borderRadius: 'var(--radius-sm)' }}>
            <strong>+ Add Test Case</strong>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Input</label>
            <textarea className="form-input" rows={3} value={draft.stdin} onChange={(event) => setDraft({ ...draft, stdin: event.target.value })} />
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Expected Output</label>
            <textarea className="form-input" rows={3} value={draft.expectedOutput} onChange={(event) => setDraft({ ...draft, expectedOutput: event.target.value })} required />
            <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Points (leave blank for backend default)</label>
            <input className="form-input" type="number" min="1" value={draft.points} onChange={(event) => setDraft({ ...draft, points: event.target.value })} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
              <input type="checkbox" checked={draft.isHidden} onChange={(event) => setDraft({ ...draft, isHidden: event.target.checked })} />
              Hidden
            </label>
            <Button type="submit" variant="primary" className="btn-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Add test case'}
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
