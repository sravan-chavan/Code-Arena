'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Editor from '@/components/ui/Editor';
import ContestTimer from '@/components/ui/ContestTimer';
import { createExecution, fetchLanguages, fetchStudentContest, fetchStudentQuestions, formatStatus, pollSubmission } from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import { Clock, Code2, Play, UploadCloud, ChevronLeft, CheckCircle, XCircle } from 'lucide-react';

export default function ContestArena() {
  const { id } = useParams();
  const [contest, setContest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);

  const load = useCallback(async () => {
    const [nextContest, nextQuestions, nextLanguages] = await Promise.all([
      fetchStudentContest(id),
      fetchStudentQuestions(id),
      fetchLanguages(),
    ]);
    setContest(nextContest);
    setQuestions(nextQuestions);
    setLanguages(nextLanguages);
    setEnded(nextContest.status !== 'running');
    setLanguage((current) => {
      if (current) return current;
      const first = nextLanguages.find((item) => item.slug === 'python') || nextLanguages[0];
      return first?.slug || 'python';
    });
    setCode((current) => {
      if (current) return current;
      const first = nextLanguages.find((item) => item.slug === 'python') || nextLanguages[0];
      return first?.template || '';
    });
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Unable to load contest.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [load]);

  async function handleExpired() {
    setEnded(true);
    try {
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'This contest has ended.');
    }
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--space-xl)' }}>
        <Link href={`/client/contests/${id}`} style={{ color: 'var(--accent-cyan)' }}>Back to contest</Link>
        <p style={{ color: 'var(--accent-rose)', marginTop: 'var(--space-md)' }}>{error}</p>
      </div>
    );
  }
  if (!contest) {
    return <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--accent-cyan)' }}>Loading Arena...</div>;
  }
  if (questions.length === 0) {
    return (
      <div style={{ padding: 'var(--space-xl)' }}>
        <Link href={`/client/contests/${id}`} style={{ color: 'var(--accent-cyan)' }}>Back to contest</Link>
        <p style={{ marginTop: 'var(--space-md)' }}>This contest has no problems yet.</p>
      </div>
    );
  }

  const activeQuestion = questions[activeQuestionIndex];
  const closed = ended || contest.status !== 'running';

  function onLanguageChange(slug) {
    setLanguage(slug);
    const selected = languages.find((item) => item.slug === slug);
    if (selected?.template) setCode(selected.template);
  }

  async function runKind(kind) {
    const running = kind === 'run' ? setIsExecuting : setIsSubmitting;
    running(true);
    setSubmissionResult(null);
    setOutput(kind === 'run' ? 'Running sample test case…' : 'Submitting to Judge0 via RabbitMQ…');
    try {
      const created = await createExecution({
        contestId: contest.id,
        questionId: activeQuestion.id,
        language,
        sourceCode: code,
        kind,
      });
      const result = await pollSubmission(created.id);
      setSubmissionResult(result);
      const lines = [
        `Result: ${formatStatus(result.status)}`,
        `Tests: ${result.testsPassed ?? 0} / ${result.testsTotal ?? 0}`,
        result.executionTime ? `Time: ${result.executionTime}s` : null,
        result.memoryKb ? `Memory: ${result.memoryKb} KB` : null,
        result.stdout ? `\nstdout:\n${result.stdout}` : null,
        result.stderr ? `\nstderr:\n${result.stderr}` : null,
        result.compileOutput ? `\ncompile:\n${result.compileOutput}` : null,
      ].filter(Boolean);
      setOutput(lines.join('\n'));
    } catch (err) {
      setOutput(err instanceof ApiError ? err.message : err.message || 'Execution failed.');
    } finally {
      running(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', background: 'var(--bg-card)', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <Link href={`/client/contests/${contest.id}`} style={{ color: 'var(--text-secondary)' }}><ChevronLeft size={20} /></Link>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{contest.title}</h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{activeQuestion.title}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            {questions.map((question, idx) => (
              <button
                key={question.id}
                onClick={() => { setActiveQuestionIndex(idx); setSubmissionResult(null); setOutput(''); }}
                style={{
                  width: '32px', height: '32px', borderRadius: 'var(--radius-sm)',
                  background: activeQuestionIndex === idx ? 'var(--accent-cyan)' : 'var(--bg-input)',
                  color: activeQuestionIndex === idx ? 'var(--bg-primary)' : 'var(--text-primary)',
                  fontWeight: 600, fontSize: '0.9rem', border: '1px solid var(--border-default)',
                }}
              >
                {String.fromCharCode(65 + idx)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(244, 63, 94, 0.1)', padding: '6px 16px', borderRadius: 'var(--radius-full)' }}>
            <Clock size={16} style={{ color: 'var(--accent-rose)' }} />
            <span style={{ color: 'var(--accent-rose)' }}>
              <ContestTimer contest={contest} onExpired={handleExpired} />
            </span>
          </div>
        </div>
      </div>

      {closed ? (
        <p style={{ color: 'var(--accent-rose)', marginBottom: 'var(--space-sm)' }}>
          This contest has ended. New executions are rejected by the API.
        </p>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', flex: 1, minHeight: 0 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{String.fromCharCode(65 + activeQuestionIndex)}. {activeQuestion.title}</h1>
            <Badge status={activeQuestion.difficulty} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>Time Limit: {activeQuestion.timeLimitSeconds}s</span>
            <span>Memory Limit: {activeQuestion.memoryLimitMb}MB</span>
          </div>
          <div style={{ marginBottom: 'var(--space-lg)', whiteSpace: 'pre-line' }}>{activeQuestion.description}</div>
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Input Format</h3>
            <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{activeQuestion.inputFormat}</p>
          </div>
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Output Format</h3>
            <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{activeQuestion.outputFormat}</p>
          </div>
          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Constraints</h3>
            <div style={{ background: 'var(--bg-input)', padding: 'var(--space-sm)', fontFamily: 'var(--font-code)', fontSize: '0.85rem' }}>{activeQuestion.constraints}</div>
          </div>
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ padding: 'var(--space-sm) var(--space-md)', fontWeight: 600, borderBottom: '1px solid var(--border-default)' }}>Sample Test Case</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <div style={{ padding: 'var(--space-md)' }}>
                <h4 style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Input</h4>
                <div style={{ fontFamily: 'var(--font-code)', whiteSpace: 'pre-wrap' }}>{activeQuestion.sampleInput}</div>
              </div>
              <div style={{ padding: 'var(--space-md)' }}>
                <h4 style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Output</h4>
                <div style={{ fontFamily: 'var(--font-code)', whiteSpace: 'pre-wrap' }}>{activeQuestion.sampleOutput}</div>
              </div>
            </div>
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', minHeight: 0 }}>
          <Card style={{ flex: 2, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Code2 size={16} />
                <select className="form-select" value={language} onChange={(e) => onLanguageChange(e.target.value)}>
                  {(languages.length ? languages : [{ slug: 'python', label: 'Python 3' }]).map((item) => (
                    <option key={item.slug} value={item.slug}>{item.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', background: '#282c34' }}>
              <Editor value={code} onChange={setCode} language={language} />
            </div>
          </Card>

          <Card>
            <div style={{ padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>Execution Console</span>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <Button variant="secondary" className="btn-sm" onClick={() => runKind('run')} disabled={closed || isExecuting || isSubmitting || !code.trim()}>
                  <Play size={14} /> Run Sample
                </Button>
                <Button variant="success" className="btn-sm" onClick={() => runKind('submit')} disabled={closed || isExecuting || isSubmitting || !code.trim()}>
                  <UploadCloud size={14} /> Submit
                </Button>
              </div>
            </div>
            {submissionResult ? (
              <div style={{ padding: 'var(--space-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', background: submissionResult.status === 'ACCEPTED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)' }}>
                {submissionResult.status === 'ACCEPTED' ? <CheckCircle size={24} color="var(--accent-emerald)" /> : <XCircle size={24} color="var(--accent-rose)" />}
                <div>
                  <div style={{ fontWeight: 700 }}>{formatStatus(submissionResult.status)}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Passed {submissionResult.testsPassed ?? 0} / {submissionResult.testsTotal ?? 0} tests
                  </div>
                </div>
              </div>
            ) : null}
            <div style={{ padding: 'var(--space-md)', background: 'var(--bg-input)', fontFamily: 'var(--font-code)', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
              {output || 'Output will appear here...'}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
