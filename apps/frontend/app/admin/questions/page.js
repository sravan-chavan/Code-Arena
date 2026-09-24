'use client';
import { useState } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { questions, formatDate } from '@/lib/mockData';
import { Plus, Search, Edit, Trash2, Filter } from 'lucide-react';

export default function AdminQuestions() {
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('all');

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.title.toLowerCase().includes(searchTerm.toLowerCase()) || q.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = difficultyFilter === 'all' || q.difficulty === difficultyFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, background: 'linear-gradient(135deg, var(--text-primary), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-display)' }}>Question Bank</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Manage the repository of coding problems and test cases.</p>
        </div>
        <Button variant="primary" className="btn-lg">
          <Plus size={18} /> Create Question
        </Button>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <div style={{ position: 'relative', width: '300px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search questions or tags..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px', paddingBottom: '8px', paddingTop: '8px' }}
              />
            </div>
            
            <div style={{ position: 'relative' }}>
              <Filter size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <select 
                className="form-select"
                style={{ paddingLeft: '36px', paddingBottom: '8px', paddingTop: '8px', height: '100%', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                value={difficultyFilter}
                onChange={(e) => setDifficultyFilter(e.target.value)}
              >
                <option value="all">All Difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>
          
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Total: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{filteredQuestions.length}</span>
          </div>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>ID</th>
                <th>Title & Tags</th>
                <th>Difficulty</th>
                <th>Test Cases</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.length > 0 ? filteredQuestions.map(q => (
                <tr key={q.id}>
                  <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-code)' }}>{q.id}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--accent-cyan)', marginBottom: '4px' }}>{q.title}</div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {q.tags.map(tag => (
                        <span key={tag} style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'var(--bg-input)', borderRadius: 'var(--radius-sm)', color: 'var(--text-secondary)' }}>{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td><Badge status={q.difficulty} /></td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {q.testCases.filter(t => !t.isHidden).length} Public, {q.testCases.filter(t => t.isHidden).length} Hidden
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{formatDate(q.createdAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <Button variant="ghost" className="btn-icon" style={{ color: 'var(--text-secondary)' }} title="Edit"><Edit size={16} /></Button>
                      <Button variant="ghost" className="btn-icon" style={{ color: 'var(--accent-rose)' }} title="Delete"><Trash2 size={16} /></Button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
                    No questions found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
