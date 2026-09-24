'use client';
import { useState, useEffect } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Editor from '@/components/ui/Editor';
import { questions, simulatePracticeRun } from '@/lib/mockData';
import { Play, Code2, Terminal, CheckCircle, Clock } from 'lucide-react';

export default function PracticeArea() {
  const [selectedQuestion, setSelectedQuestion] = useState(questions[0]);
  const [language, setLanguage] = useState('python');
  const [code, setCode] = useState('# Write your code here...\n');
  const [output, setOutput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeTab, setActiveTab] = useState('problem'); // 'problem' or 'submissions'

  // Boilerplate templates
  const templates = {
    python: 'def solve():\n    # Write your solution here\n    pass\n\nif __name__ == "__main__":\n    solve()',
    javascript: 'function solve() {\n    // Write your solution here\n}\n\nsolve();',
    cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}',
    java: 'public class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}'
  };

  useEffect(() => {
    if (code === '# Write your code here...\n' || code === '') {
      setCode(templates[language] || '');
    }
  }, [language]);

  const handleRun = async () => {
    setIsExecuting(true);
    setOutput('Compiling and executing...');
    
    try {
      const result = await simulatePracticeRun(code, language, selectedQuestion.sampleInput);
      if (result.error) {
        setOutput(`Error:\n${result.error}`);
      } else {
        setOutput(`Execution Successful (Time: ${result.runtime}ms)\n\nOutput:\n${result.output}`);
      }
    } catch (e) {
      setOutput('An error occurred during execution.');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)', height: 'calc(100vh - 120px)' }}>
      {/* Left Pane - Problem Description */}
      <Card className="flex flex-col h-full overflow-hidden" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', marginBottom: 'var(--space-md)' }}>
          <button 
            style={{ padding: '12px 24px', fontWeight: 600, borderBottom: activeTab === 'problem' ? '2px solid var(--accent-cyan)' : '2px solid transparent', color: activeTab === 'problem' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
            onClick={() => setActiveTab('problem')}
          >
            Problem Description
          </button>
          <button 
            style={{ padding: '12px 24px', fontWeight: 600, borderBottom: activeTab === 'submissions' ? '2px solid var(--accent-cyan)' : '2px solid transparent', color: activeTab === 'submissions' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }}
            onClick={() => setActiveTab('submissions')}
          >
            Problem List
          </button>
        </div>

        {activeTab === 'problem' ? (
          <div style={{ overflowY: 'auto', flex: 1, paddingRight: 'var(--space-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-md)' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedQuestion.title}</h2>
              <Badge status={selectedQuestion.difficulty} />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> {selectedQuestion.timeLimit}s</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ServerIcon size={14} /> {selectedQuestion.memoryLimit}MB</span>
            </div>

            <div style={{ marginBottom: 'var(--space-lg)', color: 'var(--text-primary)', whiteSpace: 'pre-line' }}>
              {selectedQuestion.description}
            </div>

            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)', color: 'var(--text-primary)' }}>Input Format</h3>
              <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{selectedQuestion.inputFormat}</p>
            </div>

            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)', color: 'var(--text-primary)' }}>Output Format</h3>
              <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{selectedQuestion.outputFormat}</p>
            </div>

            <div style={{ marginBottom: 'var(--space-xl)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-sm)', color: 'var(--text-primary)' }}>Constraints</h3>
              <div style={{ background: 'var(--bg-input)', padding: 'var(--space-md)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: '0.85rem', color: 'var(--accent-purple)' }}>
                {selectedQuestion.constraints.split('\n').map((c, i) => <div key={i}>{c}</div>)}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--space-xs)', color: 'var(--text-secondary)' }}>Sample Input</h4>
                <div style={{ background: 'var(--bg-input)', padding: 'var(--space-md)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: '0.85rem', minHeight: '80px', whiteSpace: 'pre-wrap' }}>
                  {selectedQuestion.sampleInput}
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 'var(--space-xs)', color: 'var(--text-secondary)' }}>Sample Output</h4>
                <div style={{ background: 'var(--bg-input)', padding: 'var(--space-md)', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-code)', fontSize: '0.85rem', minHeight: '80px', whiteSpace: 'pre-wrap' }}>
                  {selectedQuestion.sampleOutput}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
              {questions.map(q => (
                <div 
                  key={q.id} 
                  onClick={() => setSelectedQuestion(q)}
                  style={{ 
                    padding: 'var(--space-md)', 
                    background: selectedQuestion.id === q.id ? 'var(--accent-cyan-dim)' : 'var(--bg-secondary)', 
                    border: `1px solid ${selectedQuestion.id === q.id ? 'var(--accent-cyan)' : 'var(--border-default)'}`, 
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, color: selectedQuestion.id === q.id ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>{q.title}</div>
                    <Badge status={q.difficulty} />
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                    {q.tags.map(tag => (
                      <span key={tag} style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'var(--bg-input)', borderRadius: 'var(--radius-full)', color: 'var(--text-secondary)' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Right Pane - Editor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', height: '100%' }}>
        <Card style={{ flex: 3, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <Code2 size={16} style={{ color: 'var(--text-secondary)' }} />
              <select 
                className="form-select"
                style={{ padding: '4px 28px 4px 12px', fontSize: '0.85rem', background: 'var(--bg-input)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none' }}
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  setCode(templates[e.target.value]);
                }}
              >
                <option value="python">Python 3</option>
                <option value="cpp">C++ 17</option>
                <option value="java">Java 11</option>
                <option value="javascript">JavaScript (Node)</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <Button variant="secondary" className="btn-sm" onClick={() => setCode(templates[language])}>Reset</Button>
              <Button variant="primary" className="btn-sm" onClick={handleRun} disabled={isExecuting}>
                <Play size={14} style={{ marginRight: '4px' }} /> {isExecuting ? 'Running...' : 'Run Code'}
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
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Terminal Output</span>
          </div>
          <div style={{ flex: 1, padding: 'var(--space-md)', background: 'var(--bg-input)', overflowY: 'auto', fontFamily: 'var(--font-code)', fontSize: '0.85rem', color: output.includes('Error') ? 'var(--accent-rose)' : 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
            {output || 'Output will appear here after execution...'}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ServerIcon({ size, className }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
      <line x1="6" y1="6" x2="6.01" y2="6"/>
      <line x1="6" y1="18" x2="6.01" y2="18"/>
    </svg>
  );
}
