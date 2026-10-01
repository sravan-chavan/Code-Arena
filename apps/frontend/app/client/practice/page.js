'use client';
import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Editor from '@/components/ui/Editor';
import { formatDate } from '@/lib/mockData';
import { fetchLanguages, formatStatus } from '@/lib/contestsApi';
import {
  createPracticeExecution,
  fetchPracticeProblems,
  fetchPracticeSubmission,
  fetchPracticeSubmissions,
} from '@/lib/practiceApi';
import { awaitExecutionResult } from '@/lib/awaitExecution';
import { ApiError } from '@/lib/apiClient';
import { Play, UploadCloud, Code2, Terminal, Clock } from 'lucide-react';

export default function PracticeArea() {
  const [problems, setProblems] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedProblem, setSelectedProblem] = useState(null);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [activeTab, setActiveTab] = useState('problem');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextProblems, nextLanguages, nextSubmissions] = await Promise.all([
          fetchPracticeProblems(),
          fetchLanguages(),
          fetchPracticeSubmissions(),
        ]);
        if (cancelled) return;
        setProblems(nextProblems);
        setLanguages(nextLanguages);
        setSubmissions(nextSubmissions);
        const firstProblem = nextProblems[0] || null;
        setSelectedProblem(firstProblem);
        const firstLanguage = nextLanguages.find((item) => item.slug === 'python') || nextLanguages[0];
        if (firstLanguage) {
          setLanguage(firstLanguage.slug);
          setCode(firstLanguage.template || '');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Unable to load practice problems.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function onLanguageChange(slug) {
    setLanguage(slug);
    const selected = languages.find((item) => item.slug === slug);
    if (selected?.template) setCode(selected.template);
  }

  function selectProblem(problem) {
    setSelectedProblem(problem);
    setSubmissionResult(null);
    setOutput('');
    setActiveTab('problem');
  }

  async function refreshSubmissions() {
    try {
      setSubmissions(await fetchPracticeSubmissions());
    } catch {
      // Keep the last known list if the refresh fails; the run result is already shown.
    }
  }

  async function runKind(kind) {
    if (!selectedProblem) return;
    const running = kind === 'run' ? setIsExecuting : setIsSubmitting;
    running(true);
    setSubmissionResult(null);
    setOutput(kind === 'run' ? 'Running sample test case…' : 'Submitting through RabbitMQ…');
    try {
      const created = await createPracticeExecution({
        questionId: selectedProblem.id,
        language,
        sourceCode: code,
        kind,
      });
      const result = await awaitExecutionResult(
        created.id,
        () => fetchPracticeSubmission(created.id),
      );
      setSubmissionResult(result);
      const lines = [
        `Result: ${formatStatus(result.status)}`,
        `Tests: ${result.testsPassed ?? 0} / ${result.testsTotal ?? 0}`,
        result.executionTime ? `Time: ${result.executionTime}s` : null,
        result.memoryKb ? `Memory: ${result.memoryKb} KB` : null,
        result.stdout ? `\nstdout:\n${result.stdout}` : null,
        result.stderr ? `\nstderr:\n${result.stderr}` : null,
        result.compileOutput ? `\ncompile:\n${result.compileOutput}` : null,
        result.message ? `\nmessage:\n${result.message}` : null,
      ].filter(Boolean);
      setOutput(lines.join('\n'));
      await refreshSubmissions();
    } catch (err) {
      setOutput(err instanceof ApiError ? err.message : err.message || 'Execution failed.');
      await refreshSubmissions();
    } finally {
      running(false);
    }
  }

  if (error) {
    return <div style={{ padding: 'var(--space-xl)', color: 'var(--accent-rose)' }}>{error}</div>;
  }
  if (loading) {
    return <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--accent-cyan)' }}>Loading Practice Area…</div>;
  }
  if (!selectedProblem) {
    return <div style={{ padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>No practice problems are available yet.</div>;
  }

  const busy = isExecuting || isSubmitting || !code.trim();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)', height: 'calc(100vh - 120px)' }}>
      <Card className="flex flex-col h-full overflow-hidden" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', marginBottom: 'var(--space-md)' }}>
          <button
            type="button"
            style={{ padding: '12px 24px', fontWeight: 600, borderBottom: activeTab === 'problem' ? '2px solid var(--accent-cyan)' : '2px solid transparent', color: activeTab === 'problem' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
            onClick={() => setActiveTab('problem')}
          >
            Problem
          </button>
          <button
            type="button"
            style={{ padding: '12px 24px', fontWeight: 600, borderBottom: activeTab === 'list' ? '2px solid var(--accent-cyan)' : '2px solid transparent', color: activeTab === 'list' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
            onClick={() => setActiveTab('list')}
          >
            Problem List
          </button>
          <button
            type="button"
            style={{ padding: '12px 24px', fontWeight: 600, borderBottom: activeTab === 'submissions' ? '2px solid var(--accent-cyan)' : '2px solid transparent', color: activeTab === 'submissions' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
            onClick={() => setActiveTab('submissions')}
          >
            My Submissions
          </button>
        </div>

        {activeTab === 'problem' ? (
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 'var(--space-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-md)' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedProblem.title}</h2>
              <Badge status={selectedProblem.difficulty} />
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> {selectedProblem.timeLimitSeconds}s</span>
              <span>{selectedProblem.memoryLimitMb}MB</span>
            </div>
            <div style={{ marginBottom: 'var(--space-lg)', color: 'var(--text-primary)', whiteSpace: 'pre-line' }}>{selectedProblem.description}</div>
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>Input Format</h3>
              <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{selectedProblem.inputFormat}</p>
            </div>
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>Output Format</h3>
              <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{selectedProblem.outputFormat}</p>
            </div>
            <div style={{ marginBottom: 'var(--space-xl)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>Constraints</h3>
              <div style={{ background: 'var(--bg-input)', padding: 'var(--space-md)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: '0.85rem' }}>{selectedProblem.constraints}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--space-xs)', color: 'var(--text-secondary)' }}>Sample Input</h4>
                <div style={{ background: 'var(--bg-input)', padding: 'var(--space-md)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: '0.85rem', minHeight: '80px', whiteSpace: 'pre-wrap' }}>{selectedProblem.sampleInput || '(none)'}</div>
              </div>
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--space-xs)', color: 'var(--text-secondary)' }}>Sample Output</h4>
                <div style={{ background: 'var(--bg-input)', padding: 'var(--space-md)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: '0.85rem', minHeight: '80px', whiteSpace: 'pre-wrap' }}>{selectedProblem.sampleOutput}</div>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'list' ? (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {problems.map((problem) => (
                <button
                  type="button"
                  key={problem.id}
                  onClick={() => selectProblem(problem)}
                  style={{
                    padding: 'var(--space-md)',
                    textAlign: 'left',
                    background: selectedProblem.id === problem.id ? 'var(--accent-cyan-dim)' : 'var(--bg-secondary)',
                    border: `1px solid ${selectedProblem.id === problem.id ? 'var(--accent-cyan)' : 'var(--border-default)'}`,
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, color: selectedProblem.id === problem.id ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>{problem.title}</div>
                    <Badge status={problem.difficulty} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'submissions' ? (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {submissions.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No practice submissions yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                {submissions.map((submission) => (
                  <div key={submission.id} style={{ padding: 'var(--space-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Badge status={submission.status} customLabel={formatStatus(submission.status)} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{formatDate(submission.createdAt)}</span>
                    </div>
                    <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {submission.kind} · {submission.languageSlug} · {submission.testsPassed ?? 0}/{submission.testsTotal ?? 0}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', height: '100%' }}>
        <Card style={{ flex: 3, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Code2 size={16} style={{ color: 'var(--text-secondary)' }} />
              <select
                className="form-select"
                value={language}
                onChange={(e) => onLanguageChange(e.target.value)}
                style={{ padding: '4px 28px 4px 12px', fontSize: '0.85rem', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
              >
                {(languages.length ? languages : [{ slug: 'python', label: 'Python 3' }]).map((item) => (
                  <option key={item.slug} value={item.slug}>{item.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <Button variant="secondary" className="btn-sm" onClick={() => runKind('run')} disabled={busy}>
                <Play size={14} style={{ marginRight: '4px' }} /> {isExecuting ? 'Running…' : 'Run'}
              </Button>
              <Button variant="success" className="btn-sm" onClick={() => runKind('submit')} disabled={busy}>
                <UploadCloud size={14} style={{ marginRight: '4px' }} /> {isSubmitting ? 'Submitting…' : 'Submit'}
              </Button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'hidden', background: '#282c34' }}>
            <Editor value={code} onChange={setCode} language={language} />
          </div>
        </Card>

        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', minHeight: '200px' }}>
          <div style={{ padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <Terminal size={16} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Execution Result</span>
          </div>
          {submissionResult ? (
            <div style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: '0.85rem', fontWeight: 700 }}>
              {formatStatus(submissionResult.status)}
            </div>
          ) : null}
          <div style={{ flex: 1, padding: 'var(--space-md)', background: 'var(--bg-input)', overflowY: 'auto', fontFamily: 'var(--font-code)', fontSize: '0.85rem', color: output.toLowerCase().includes('error') || output.includes('Timed out') ? 'var(--accent-rose)' : 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {output || 'Output will appear here after execution...'}
          </div>
        </Card>
      </div>
    </div>
  );
}
