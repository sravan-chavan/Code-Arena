'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Editor from '@/components/ui/Editor';
import ContestTimer from '@/components/ui/ContestTimer';
import ConnectionStatus from '@/components/ui/ConnectionStatus';
import {
  createExecution,
  enterContest,
  exitContest,
  fetchContestSession,
  fetchLanguages,
  fetchStudentContest,
  fetchStudentContestSubmissions,
  fetchStudentQuestions,
  fetchStudentRanking,
  fetchSubmission,
  formatStatus,
  reportContestViolation,
  setCurrentQuestion,
} from '@/lib/contestsApi';
import {
  attachArenaProctor,
  clearIntentionalExit,
  createProctorState,
  markFullscreenEngaged,
  markIntentionalExit,
  requestArenaFullscreen,
} from '@/lib/arenaProctoring';
import { awaitExecutionResult } from '@/lib/awaitExecution';
import { mergeRanking, submissionView } from '@/lib/realtimeConfig';
import { useContestChannel } from '@/lib/useContestChannel';
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
  const [endingSoon, setEndingSoon] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [livePhase, setLivePhase] = useState('');
  const [exitOpen, setExitOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const [violationMessage, setViolationMessage] = useState('');
  const sessionStatusRef = useRef(null);
  const endedRef = useRef(false);
  const proctorStateRef = useRef(null);
  const performExitRef = useRef(async () => { });
  const exitingRef = useRef(false);
  const questionIdRef = useRef(null);
  const executionAbortRef = useRef(null);

  const handleLock = useCallback((err) => {
    if (err instanceof ApiError && LOCK_CODES.has(err.code)) {
      setEnded(true);
      setLockMessage(err.message);
      return true;
    }
    return false;
  }, []);

  const refreshMeta = useCallback(async (opts) => {
    const [nextRanking, nextHistory] = await Promise.all([
      fetchStudentRanking(id, opts),
      fetchStudentContestSubmissions(id, opts),
    ]);
    setRanking(nextRanking);
    setHistory(nextHistory);
  }, [id]);

  const load = useCallback(async (opts) => {
    const nextSession = await enterContest(id);
    const [nextContest, nextQuestions, nextLanguages] = await Promise.all([
      fetchStudentContest(id, opts),
      fetchStudentQuestions(id, opts),
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
    await refreshMeta(opts);
    return { nextSession, nextQuestions };
  }, [id, refreshMeta]);

  const onContestEvent = useCallback((event) => {
    if (!event || event.version !== 1) return;
    if (event.type === 'contest.ranking.updated') {
      if (event.payload?.mode === 'snapshot') {
        setRanking((current) => mergeRanking(current, event.payload.ranking || []));
      } else if (event.payload?.mode === 'invalidate') {
        fetchStudentRanking(id).then(setRanking).catch(() => { });
      }
    }
    if (event.type === 'participant.score.updated' && event.payload) {
      setSession((current) => (
        current && current.participantId === event.payload.participantId
          ? {
            ...current,
            score: event.payload.score,
            penalty: event.payload.penalty,
            possibleScore: event.payload.possibleScore,
            solvedCount: event.payload.solvedCount,
          }
          : current
      ));
    }
    if (event.type === 'contest.started') {
      setContest((current) => (current ? {
        ...current,
        status: event.payload?.status || 'running',
        startTime: event.payload?.startTime ?? current.startTime,
        endTime: event.payload?.endTime ?? current.endTime,
        resumedAt: event.payload?.resumedAt ?? current.resumedAt,
        serverTime: event.payload?.serverTime || current.serverTime,
      } : current));
      const status = sessionStatusRef.current;
      if (status === 'exited' || status === 'removed') {
        setEnded(true);
        return;
      }
      fetchContestSession(id)
        .then((next) => {
          setSession(next);
          const blocked = next.status === 'exited'
            || next.status === 'removed'
            || next.status === 'completed'
            || next.sessionExpired;
          setEnded(blocked);
          if (!blocked) {
            setLockMessage('');
            setEndingSoon(false);
          }
        })
        .catch((err) => {
          handleLock(err);
        });
    }
    if (event.type === 'contest.ending') {
      setEndingSoon(true);
    }
    if (event.type === 'contest.ended' || event.type === 'contest.cancelled') {
      setEnded(true);
      setLockMessage(event.type === 'contest.cancelled'
        ? 'This contest has been cancelled.'
        : 'This contest has ended.');
      setContest((current) => (
        current ? { ...current, status: event.payload?.status || 'ended' } : current
      ));
    }
    if (event.type === 'participant.removed' || event.payload?.reason === 'PARTICIPANT_REMOVED') {
      setEnded(true);
      setLockMessage('You have been removed from this contest.');
    } else if (event.type === 'contest.session.invalidated' && event.payload?.reason === 'SESSION_EXPIRED') {
      setEnded(true);
      setLockMessage('Your contest time has expired.');
    } else if (event.type === 'contest.session.invalidated' && event.payload?.reason === 'SESSION_ENDED') {
      setEnded(true);
      setLockMessage('You exited this contest. You cannot re-enter unless an administrator adds you again.');
    }
    if (event.type === 'participant.status.updated' && event.payload?.status === 'exited') {
      setEnded(true);
      setLockMessage('You exited this contest. You cannot re-enter unless an administrator adds you again.');
    }
    if (
      event.type === 'participant.status.updated'
      && (event.payload?.status === 'started' || event.payload?.status === 'registered')
    ) {
      fetchContestSession(id)
        .then((next) => {
          setSession(next);
          const blocked = next.status === 'exited' || next.status === 'removed' || next.sessionExpired;
          setEnded(blocked);
          if (!blocked) setLockMessage('');
        })
        .catch((err) => {
          handleLock(err);
        });
    }
  }, [id, handleLock]);

  const reconcile = useCallback(async () => {
    try {
      const [nextSession, nextRanking, nextContest] = await Promise.all([
        fetchContestSession(id),
        fetchStudentRanking(id),
        fetchStudentContest(id),
      ]);
      setSession(nextSession);
      setRanking(nextRanking);
      setContest(nextContest);
      const closed = nextContest.status !== 'running'
        || nextSession.status === 'removed'
        || nextSession.status === 'exited'
        || nextSession.sessionExpired;
      if (closed) {
        setEnded(true);
      }
    } catch (err) {
      handleLock(err);
    }
  }, [id, handleLock]);

  const connectionStatus = useContestChannel(id, onContestEvent, { onReconnect: reconcile });

  useEffect(() => {
    sessionStatusRef.current = session?.status || null;
    endedRef.current = ended;
  }, [session, ended]);

  const applyViolationPayload = useCallback((payload) => {
    if (!payload?.session) return;
    setSession(payload.session);
    const invalidated = new Set(payload.session.invalidatedQuestionIds || []);
    if (invalidated.size > 0) {
      setQuestions((current) => current.map((question) => (
        invalidated.has(question.id)
          ? { ...question, invalidated: true, earnedPoints: 0, totalPoints: 0 }
          : question
      )));
    }
  }, []);

  const performExit = useCallback(async () => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    markIntentionalExit(proctorStateRef.current);
    setExiting(true);
    setError('');
    try {
      const next = await exitContest(id);
      setSession(next);
      setEnded(true);
      endedRef.current = true;
      setLockMessage('You exited this contest. You cannot re-enter unless an administrator adds you again.');
      setExitOpen(false);
      if (typeof document !== 'undefined' && document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen().catch(() => { });
      }
      router.replace(`/client/contests/${id}`);
    } catch (err) {
      clearIntentionalExit(proctorStateRef.current);
      if (!handleLock(err)) {
        setError(err instanceof ApiError ? err.message : 'Unable to exit the contest.');
      } else {
        setExitOpen(false);
        router.replace(`/client/contests/${id}`);
      }
    } finally {
      exitingRef.current = false;
      setExiting(false);
    }
  }, [id, router, handleLock]);

  useEffect(() => {
    performExitRef.current = performExit;
  }, [performExit]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
    const state = createProctorState();
    proctorStateRef.current = state;
    if (document.fullscreenElement) {
      markFullscreenEngaged(state);
      setFullscreenActive(true);
    }
    return attachArenaProctor({ document, window }, {
      allow: () => {
        if (endedRef.current) return false;
        const status = sessionStatusRef.current;
        return status === 'started' || status === 'registered';
      },
      onViolation: async (claim) => {
        try {
          const payload = await reportContestViolation(id, claim);
          applyViolationPayload(payload);
          setViolationMessage(claim.source === 'fullscreenchange'
            ? 'You left fullscreen. The question you were on is invalidated and scores 0. Enter fullscreen again to continue with other questions.'
            : 'You left this contest tab. The question you were on is invalidated and scores 0. You can continue with other questions.');
        } catch (err) {
          if (handleLock(err)) return;
          setViolationMessage(err instanceof ApiError ? err.message : 'Unable to record the proctoring event.');
          throw err;
        }
      },
      onIntentionalExit: () => {
        const status = sessionStatusRef.current;
        if (endedRef.current || (status !== 'started' && status !== 'registered')) {
          clearIntentionalExit(proctorStateRef.current);
          return;
        }
        performExitRef.current();
      },
      onFullscreenChange: ({ active }) => {
        setFullscreenActive(active);
      },
    }, { state });
  }, [id, applyViolationPayload, handleLock]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const loaded = await load({ signal: controller.signal });
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
    return () => {
      cancelled = true;
      controller.abort();
      executionAbortRef.current?.abort();
    };
  }, [load, handleLock, id]);

  async function enterFullscreen() {
    setFullscreenError('');
    const result = await requestArenaFullscreen(document);
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    if (!result.ok || !document.fullscreenElement) {
      setFullscreenActive(false);
      setFullscreenError(result.reason === 'unsupported'
        ? 'This browser does not support fullscreen. Use a current desktop browser and try again.'
        : 'Fullscreen was blocked. Allow fullscreen for this site, then try again.');
      return;
    }
    markFullscreenEngaged(proctorStateRef.current);
    setFullscreenActive(true);
  }

  async function handleExpired() {
    if (ended) return;
    setEnded(true);
    try {
      const nextSession = await fetchContestSession(id);
      setSession(nextSession);
      if (nextSession.sessionExpired || nextSession.status === 'completed') {
        setLockMessage('Your contest time has expired.');
      }
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
    if (lockMessage) {
      return (
        <div style={{ padding: 'var(--space-xl)' }}>
          <p data-testid="contest-lock" style={{ color: 'var(--accent-rose)' }}>{lockMessage}</p>
        </div>
      );
    }
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
  const canExit = session.status === 'started' || session.status === 'registered';
  const showGate = !closed && !fullscreenActive && canExit;
  const violationNote = violationMessage ? (
    <p data-testid="proctor-violation" style={{ color: 'var(--accent-rose)', marginBottom: 'var(--space-sm)' }}>
      {violationMessage}
    </p>
  ) : null;
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
      setLivePhase('Queued');
      const controller = new AbortController();
      executionAbortRef.current = controller;
      const result = await awaitExecutionResult(
        created.id,
        () => fetchSubmission(created.id, { signal: controller.signal }),
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'submission.queued') setLivePhase('Queued');
            if (event.type === 'submission.evaluating') setLivePhase('Evaluating');
          },
        },
      );
      const view = submissionView(result, created.id);
      setLivePhase('');
      setSubmissionResult(view);
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
      setHistory((current) => [view, ...current.filter((row) => row.id !== view.id)]);
      if (kind === 'submit') {
        const nextQuestions = await fetchStudentQuestions(id);
        setQuestions(nextQuestions);
      }
    } catch (err) {
      if (!handleLock(err)) {
        setOutput(err instanceof ApiError ? err.message : err.message || 'Execution failed.');
      }
    } finally {
      running(false);
      setLivePhase('');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', background: 'var(--bg-card)', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{contest.title}</h2>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>Score {session.score} / {session.possibleScore} · Penalty {session.penalty} · Rank {you?.rank ?? '—'}</span>
            <ConnectionStatus status={connectionStatus} />
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
          {canExit && !showGate ? (
            <Button type="button" variant="secondary" onClick={() => setExitOpen(true)}>
              Exit Contest
            </Button>
          ) : null}
        </div>
      </div>

      {exitOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-contest-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 40,
            padding: 'var(--space-md)',
          }}
        >
          <div className="card" style={{ maxWidth: 440, width: '100%' }}>
            <h2 id="exit-contest-title" style={{ fontSize: '1.15rem', marginBottom: 'var(--space-sm)' }}>Exit Contest</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-lg)' }}>
              Are you sure you want to exit this contest? You will not be able to re-enter unless an administrator adds you again.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <Button type="button" variant="ghost" disabled={exiting} onClick={() => setExitOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="secondary" disabled={exiting} onClick={performExit}>
                <span data-testid="confirm-exit-contest">{exiting ? 'Exiting…' : 'Exit Contest'}</span>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showGate ? (
        <div
          data-testid="fullscreen-gate"
          role="region"
          aria-label="Fullscreen required"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 30,
            padding: 'var(--space-md)',
          }}
        >
          <div className="card" style={{ maxWidth: 560, width: '100%' }}>
            <h2 style={{ fontSize: '1.15rem', marginBottom: 'var(--space-sm)' }}>Fullscreen is required</h2>
            <p data-testid="fullscreen-warning" style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
              Fullscreen is required while you are in the Arena. Switching tabs, minimizing the browser, or leaving fullscreen invalidates the question you are currently on. Your Tab switch will be recorded and action will be taken. Your other questions stay open. Exit Contest asks you to confirm, then uses exit. After you exit, only an administrator can add you again. This page cannot disable operating-system or browser shortcuts.
            </p>
            {violationNote}
            {fullscreenError ? (
              <p data-testid="fullscreen-error" style={{ color: 'var(--accent-rose)', marginBottom: 'var(--space-md)' }}>
                {fullscreenError}
              </p>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <Button type="button" variant="secondary" onClick={() => setExitOpen(true)}>
                Exit Contest
              </Button>
              <Button type="button" onClick={enterFullscreen}>
                <span data-testid="enter-fullscreen">Enter fullscreen</span>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showGate ? null : violationNote}
      {endingSoon && !closed ? (
        <p style={{ color: 'var(--accent-cyan)', marginBottom: 'var(--space-sm)' }}>Contest ending soon.</p>
      ) : null}
      {lockMessage || closed ? (
        <p data-testid="contest-lock" style={{ color: 'var(--accent-rose)', marginBottom: 'var(--space-sm)' }}>
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
              {livePhase ? `${livePhase}\n` : ''}{output || 'Output will appear here...'}
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
