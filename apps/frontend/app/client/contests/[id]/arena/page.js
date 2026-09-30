'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Editor from '@/components/ui/Editor';
import ContestTimer from '@/components/ui/ContestTimer';
import {
  createExecution,
  enterContest,
  exitContest,
  fetchLanguages,
  fetchStudentContest,
  fetchStudentContestSubmissions,
  fetchStudentQuestions,
  fetchStudentRanking,
  formatStatus,
  pollSubmission,
  reportContestViolation,
  setCurrentQuestion,
} from '@/lib/contestsApi';
import { ApiError } from '@/lib/apiClient';
import { Clock, Code2, Play, UploadCloud, CheckCircle, XCircle } from 'lucide-react';

const LOCK_CODES = new Set(['PARTICIPANT_REMOVED', 'SESSION_ENDED', 'SESSION_EXPIRED']);

export default function ContestArena() {
  const { id } = useParams();
  const router = useRouter();
  const [contest, setContest] = useState(null);
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [history, setHistory] = useState([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const reportingRef = useRef(false);
  const questionIdRef = useRef(null);

  const handleLock = useCallback((err) => {
    if (err instanceof ApiError && LOCK_CODES.has(err.code)) {
      setEnded(true);
      setLockMessage(err.message);
      return true;
    }
    return false;
  }, []);

  const refreshMeta = useCallback(async () => {
    const [nextRanking, nextHistory] = await Promise.all([
      fetchStudentRanking(id),
      fetchStudentContestSubmissions(id),
    ]);
    setRanking(nextRanking);
    setHistory(nextHistory);
  }, [id]);

  const load = useCallback(async () => {
    const nextSession = await enterContest(id);
    const [nextContest, nextQuestions, nextLanguages] = await Promise.all([
      fetchStudentContest(id),
      fetchStudentQuestions(id),
      fetchLanguages(),
    ]);
    setSession(nextSession);
    setContest(nextContest);
    setQuestions(nextQuestions);
    setLanguages(nextLanguages);
    setEnded(Boolean(nextSession.sessionExpired) || nextContest.status !== 'running' || nextSession.status === 'completed' || nextSession.status === 'exited' || nextSession.status === 'removed');
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
    await refreshMeta();
    return { nextSession, nextQuestions };
  }, [id, refreshMeta]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await load();
        if (cancelled) return;
        const first = loaded.nextQuestions[0];
        if (first) {
          questionIdRef.current = first.id;
          await setCurrentQuestion(id, first.id);
        }
      } catch (err) {
        if (!cancelled) {
          if (!handleLock(err)) {
            setError(err instanceof ApiError ? err.message : 'Unable to load contest.');
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [load, handleLock, id]);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== 'hidden' || reportingRef.current || ended) return;
      reportingRef.current = true;
      reportContestViolation(id, 'TAB_SWITCH')
        .then(async (payload) => {
          setSession(payload.session);
          const nextQuestions = await fetchStudentQuestions(id);
          setQuestions(nextQuestions);
          await refreshMeta();
        })
        .catch((err) => {
          if (!handleLock(err)) {
            setError(err instanceof ApiError ? err.message : 'Unable to record contest event.');
          }
        })
        .finally(() => {
          reportingRef.current = false;
        });
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [id, ended, handleLock, refreshMeta]);

  useEffect(() => {
    function onKeyDown(event) {
      if (!(event.ctrlKey && event.shiftKey && (event.key === 'C' || event.key === 'c'))) return;
      event.preventDefault();
      event.stopPropagation();
      exitContest(id)
        .then(() => {
          router.replace(`/client/contests/${id}`);
        })
        .catch((err) => {
          if (!handleLock(err)) {
            setError(err instanceof ApiError ? err.message : 'Unable to close the contest session.');
          } else {
            router.replace(`/client/contests/${id}`);
          }
        });
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [id, router, handleLock]);

  async function handleExpired() {
    setEnded(true);
    try {
      await load();
    } catch (err) {
      if (!handleLock(err)) {
        setLockMessage(err instanceof ApiError ? err.message : 'This contest has ended.');
      }
    }
  }

  async function selectQuestion(index) {
    const question = questions[index];
    if (!question) return;
    setActiveQuestionIndex(index);
    setSubmissionResult(null);
    setOutput('');
    questionIdRef.current = question.id;
    try {
      const next = await setCurrentQuestion(id, question.id);
      setSession(next);
    } catch (err) {
      if (!handleLock(err)) {
        setError(err instanceof ApiError ? err.message : 'Unable to select question.');
      }
    }
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--space-xl)' }}>
        <p style={{ color: 'var(--accent-rose)' }}>{error}</p>
      </div>
    );
  }
  if (!contest || !session) {
    return <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--accent-cyan)' }}>Loading Arena...</div>;
  }
  if (questions.length === 0) {
    return (
      <div style={{ padding: 'var(--space-xl)' }}>
        <p>This contest has no problems yet.</p>
      </div>
    );
  }

  const activeQuestion = questions[activeQuestionIndex];
  const closed = ended || contest.status !== 'running' || session.sessionExpired || ['completed', 'exited', 'removed'].includes(session.status);
  const questionHistory = history.filter((row) => row.questionId === activeQuestion.id && row.kind === 'submit');
  const you = ranking.find((row) => row.participantId === session.participantId);

  function onLanguageChange(slug) {
    setLanguage(slug);
    const selected = languages.find((item) => item.slug === slug);
    if (selected?.template) setCode(selected.template);
  }

  async function runKind(kind) {
    if (activeQuestion.invalidated && kind === 'submit') {
      setOutput('This question is invalidated for you and cannot award points.');
      return;
    }
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
      const publicResults = (result.testResults || []).filter((row) => !row.isHidden);
      const lines = [
        `Result: ${formatStatus(result.status)}`,
        `Score: ${result.score ?? 0}`,
        `Tests: ${result.testsPassed ?? 0} / ${result.testsTotal ?? 0}`,
        result.executionTime ? `Time: ${result.executionTime}s` : null,
        result.memoryKb ? `Memory: ${result.memoryKb} KB` : null,
        publicResults.length
          ? publicResults.map((row) => `Public test ${row.sortOrder + 1}: ${row.passed ? 'PASS' : 'FAIL'} (${row.pointsEarned}/${row.points})`).join('\n')
          : null,
        result.stdout ? `\nstdout:\n${result.stdout}` : null,
        result.stderr ? `\nstderr:\n${result.stderr}` : null,
        result.compileOutput ? `\ncompile:\n${result.compileOutput}` : null,
      ].filter(Boolean);
      setOutput(lines.join('\n'));
      const nextQuestions = await fetchStudentQuestions(id);
      setQuestions(nextQuestions);
      const nextSession = await enterContest(id);
      setSession(nextSession);
      await refreshMeta();
    } catch (err) {
      if (!handleLock(err)) {
        setOutput(err instanceof ApiError ? err.message : err.message || 'Execution failed.');
      }
    } finally {
      running(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', background: 'var(--bg-card)', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{contest.title}</h2>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Score {session.score} / {session.possibleScore} · Penalty {session.penalty} · Rank {you?.rank ?? '—'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            {questions.map((question, idx) => (
              <button
                key={question.id}
                onClick={() => selectQuestion(idx)}
                style={{
                  width: '32px', height: '32px', borderRadius: 'var(--radius-sm)',
                  background: activeQuestionIndex === idx ? 'var(--accent-cyan)' : question.invalidated ? 'rgba(244, 63, 94, 0.2)' : 'var(--bg-input)',
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
              <ContestTimer contest={contest} deadline={session.effectiveDeadline} onExpired={handleExpired} />
            </span>
          </div>
        </div>
      </div>

      {lockMessage || closed ? (
        <p style={{ color: 'var(--accent-rose)', marginBottom: 'var(--space-sm)' }}>
          {lockMessage || 'This contest session is closed. New executions are rejected by the API.'}
        </p>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', flex: 1, minHeight: 0 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{String.fromCharCode(65 + activeQuestionIndex)}. {activeQuestion.title}</h1>
            <Badge status={activeQuestion.invalidated ? 'ended' : activeQuestion.difficulty} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>Time Limit: {activeQuestion.timeLimitSeconds}s</span>
            <span>Memory Limit: {activeQuestion.memoryLimitMb}MB</span>
            <span>Points: {activeQuestion.earnedPoints ?? 0} / {activeQuestion.invalidated ? 0 : activeQuestion.totalPoints}</span>
          </div>
          {activeQuestion.invalidated ? (
            <p style={{ color: 'var(--accent-rose)', marginBottom: 'var(--space-md)' }}>
              This question is invalidated for you. It contributes 0 points.
            </p>
          ) : null}
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
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)' }}>
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
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>Ranking</h3>
            {ranking.length === 0 ? <p style={{ color: 'var(--text-secondary)' }}>No ranking yet.</p> : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Score</th>
                    <th>Penalty</th>
                    <th>Solved</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.slice(0, 8).map((row) => (
                    <tr key={row.participantId} style={{ fontWeight: row.participantId === session.participantId ? 700 : 400 }}>
                      <td>{row.rank}</td>
                      <td>{row.score}</td>
                      <td>{row.penalty}</td>
                      <td>{row.solvedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
                <Button variant="success" className="btn-sm" onClick={() => runKind('submit')} disabled={closed || isExecuting || isSubmitting || !code.trim() || activeQuestion.invalidated}>
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
                    Score {submissionResult.score ?? 0} · Passed {submissionResult.testsPassed ?? 0} / {submissionResult.testsTotal ?? 0}
                  </div>
                </div>
              </div>
            ) : null}
            <div style={{ padding: 'var(--space-md)', background: 'var(--bg-input)', fontFamily: 'var(--font-code)', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
              {output || 'Output will appear here...'}
            </div>
            {questionHistory.length > 0 ? (
              <div style={{ padding: 'var(--space-md)', borderTop: '1px solid var(--border-default)' }}>
                <strong style={{ fontSize: '0.85rem' }}>Submission history</strong>
                <ul style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {questionHistory.slice(0, 6).map((row) => (
                    <li key={row.id}>{formatStatus(row.status)} · {row.score ?? 0} pts · {row.createdAt}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
