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

const emptyDraft = { stdin: '', expectedOutput: '', isHidden: true };

export default function TestCasePanel({ questionId, onChanged }) {
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
      setEdits(Object.fromEntries(rows.map((row) => [row.id, {
        stdin: row.stdin || '',
        expectedOutput: row.expectedOutput || '',
        isHidden: Boolean(row.isHidden),
      }])));
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
      });
    }, 'Test case updated.');
  }

  async function handleDelete(testCaseId) {
    await run(async () => {
      await deleteAdminTestCase(questionId, testCaseId);
    }, 'Test case deleted.');
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
        {cases.length > 0 ? (
          <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.8rem' }}>
            ({cases.length})
          </span>
        ) : null}
      </button>
      {open ? (
        <div style={{ marginTop: 'var(--space-md)', display: 'grid', gap: 'var(--space-md)' }}>
          {error ? <p style={{ color: 'var(--accent-rose)' }}>{error}</p> : null}
          {success ? <p style={{ color: 'var(--accent-emerald)' }}>{success}</p> : null}
          {loading ? <p style={{ color: 'var(--text-secondary)' }}>Loading test cases…</p> : null}
          {cases.map((testCase, index) => {
            const edit = edits[testCase.id] || emptyDraft;
            return (
              <div key={testCase.id} style={{ padding: 'var(--space-md)', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', display: 'grid', gap: 'var(--space-sm)' }}>
                <strong>Test Case {index + 1}</strong>
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
