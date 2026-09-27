'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getContestById, getContestQuestions, formatTime, simulateExecution } from '@/lib/mockData';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Editor from '@/components/ui/Editor';
import { Clock, Code2, Play, UploadCloud, ChevronLeft, ChevronRight, CheckCircle, XCircle } from 'lucide-react';
import Link from 'next/link';

export default function ContestArena() {
  const { id } = useParams();
  const router = useRouter();
  const [contest, setContest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);

  useEffect(() => {
    // Load contest data
    const c = getContestById(id);
    if (!c || c.status !== 'running') {
      router.push('/client/contests'); // Redirect if invalid or not running
      return;
    }
    setContest(c);
    setQuestions(getContestQuestions(id));
  }, [id, router]);

  if (!contest || questions.length === 0) return <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--accent-cyan)' }}>Loading Arena...</div>;

  const activeQuestion = questions[activeQuestionIndex];

  const handleRun = async () => {
    setIsExecuting(true);
    setOutput('Compiling and running against sample test cases...');
    setSubmissionResult(null);
    
    try {
      // Simulate quick run against sample only
      const result = await simulateExecution(code, language, [activeQuestion.testCases[0]]);
      if (result.status === 'accepted') {
        setOutput(`Success! Passed sample test cases (Time: ${result.runtime}ms, Mem: ${result.memory}MB)\n\nSample Output matched expected result.`);
      } else {
        setOutput(`Failed sample test cases.\n\nExpected:\n${activeQuestion.testCases[0].expected}\n\nActual output did not match.`);
      }
    } catch (e) {
      setOutput('An error occurred during execution.');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setOutput('Submitting to judging servers...\nRunning against hidden test cases...');
    
    try {
      const result = await simulateExecution(code, language, activeQuestion.testCases);
      setSubmissionResult(result);
      
      let outText = `Submission Result: ${result.status.replace('_', ' ').toUpperCase()}\n`;
      outText += `Test Cases Passed: ${result.testsPassed} / ${result.totalTests}\n`;
      outText += `Runtime: ${result.runtime}ms | Memory: ${result.memory}MB\n`;
      
      setOutput(outText);
    } catch (e) {
      setOutput('An error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {/* Top Bar for Arena */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', background: 'var(--bg-card)', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
          <Link href="/client/contests" style={{ color: 'var(--text-secondary)' }}><ChevronLeft size={20} /></Link>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{contest.title}</h2>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ACM-ICPC Rules • Penalty for wrong submissions</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            {questions.map((q, idx) => (
              <button 
                key={q.id}
                onClick={() => { setActiveQuestionIndex(idx); setSubmissionResult(null); setOutput(''); }}
                style={{ 
                  width: '32px', height: '32px', borderRadius: 'var(--radius-sm)', 
                  background: activeQuestionIndex === idx ? 'var(--accent-cyan)' : 'var(--bg-input)',
                  color: activeQuestionIndex === idx ? 'var(--bg-primary)' : 'var(--text-primary)',
                  fontWeight: 600, fontSize: '0.9rem',
                  border: '1px solid var(--border-default)'
                }}
              >
                {String.fromCharCode(65 + idx)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(244, 63, 94, 0.1)', padding: '6px 16px', borderRadius: 'var(--radius-full)', border: '1px solid rgba(244, 63, 94, 0.3)' }}>
            <Clock size={16} style={{ color: 'var(--accent-rose)' }} />
            <span style={{ fontFamily: 'var(--font-code)', fontWeight: 700, color: 'var(--accent-rose)', fontSize: '1.1rem' }}>{formatTime(contest.remainingTime)}</span>
          </div>
        </div>
      </div>

      {/* Main Arena Area (Split pane) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', flex: 1, minHeight: 0 }}>
        {/* Left Pane - Problem */}
        <Card style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-md)' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {String.fromCharCode(65 + activeQuestionIndex)}. {activeQuestion.title}
            </h1>
            <Badge status={activeQuestion.difficulty} />
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <span>Time Limit: {activeQuestion.timeLimit}s</span>
            <span>Memory Limit: {activeQuestion.memoryLimit}MB</span>
          </div>

          <div style={{ marginBottom: 'var(--space-lg)', color: 'var(--text-primary)', whiteSpace: 'pre-line', fontSize: '0.95rem' }}>
            {activeQuestion.description}
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>Input Format</h3>
            <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line', fontSize: '0.9rem' }}>{activeQuestion.inputFormat}</p>
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>Output Format</h3>
            <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line', fontSize: '0.9rem' }}>{activeQuestion.outputFormat}</p>
          </div>

          <div style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)' }}>Constraints</h3>
            <div style={{ background: 'var(--bg-input)', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: '0.85rem', color: 'var(--accent-purple)' }}>
              {activeQuestion.constraints.split('\n').map((c, i) => <div key={i}>{c}</div>)}
            </div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ background: 'var(--bg-input)', padding: 'var(--space-sm) var(--space-md)', fontWeight: 600, fontSize: '0.9rem', borderBottom: '1px solid var(--border-default)' }}>Sample Test Case</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border-default)' }}>
              <div style={{ background: 'var(--bg-secondary)', padding: 'var(--space-md)' }}>
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>Input</h4>
                <div style={{ fontFamily: 'var(--font-code)', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{activeQuestion.sampleInput}</div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: 'var(--space-md)' }}>
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-xs)' }}>Output</h4>
                <div style={{ fontFamily: 'var(--font-code)', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{activeQuestion.sampleOutput}</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Right Pane - Editor & Output */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', minHeight: 0 }}>
          <Card style={{ flex: 2, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Code2 size={16} style={{ color: 'var(--text-secondary)' }} />
                <select 
                  className="form-select"
                  style={{ padding: '4px 28px 4px 12px', fontSize: '0.85rem', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="python">Python 3</option>
                  <option value="cpp">C++ 17</option>
                  <option value="java">Java 11</option>
                  <option value="javascript">JavaScript (Node)</option>
                </select>
              </div>
            </div>
            
            <div style={{ flex: 1, overflow: 'hidden', background: '#282c34' }}>
              <Editor value={code} onChange={setCode} language={language} />
            </div>
          </Card>

          <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Execution Console</span>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <Button variant="secondary" className="btn-sm" onClick={handleRun} disabled={isExecuting || isSubmitting}>
                  <Play size={14} style={{ marginRight: '4px' }} /> Run Sample
                </Button>
                <Button variant="success" className="btn-sm" onClick={handleSubmit} disabled={isExecuting || isSubmitting}>
                  <UploadCloud size={14} style={{ marginRight: '4px' }} /> Submit
                </Button>
              </div>
            </div>
            
            {submissionResult ? (
              <div style={{ padding: 'var(--space-md)', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', background: submissionResult.status === 'accepted' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)' }}>
                {submissionResult.status === 'accepted' ? <CheckCircle size={24} color="var(--accent-emerald)" /> : <XCircle size={24} color="var(--accent-rose)" />}
                <div>
                  <div style={{ fontWeight: 700, color: submissionResult.status === 'accepted' ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                    {submissionResult.status.replace('_', ' ').toUpperCase()}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Passed {submissionResult.testsPassed} / {submissionResult.totalTests} hidden test cases
                  </div>
                </div>
              </div>
            ) : null}

            <div style={{ flex: 1, padding: 'var(--space-md)', background: 'var(--bg-input)', overflowY: 'auto', fontFamily: 'var(--font-code)', fontSize: '0.85rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
              {output || 'Output will appear here...'}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
