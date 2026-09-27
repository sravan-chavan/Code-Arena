'use client';
import { useState } from 'react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { users } from '@/lib/mockData';
import { Search, Shield, User, Filter, Edit, Ban } from 'lucide-react';

export default function AdminUsers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (u.rollNo && u.rollNo.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesFilter = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-6">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, background: 'linear-gradient(135deg, var(--text-primary), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-display)' }}>Participant Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Manage user accounts, roles, and access controls.</p>
        </div>
        <Button variant="primary" className="btn-lg">
          <User size={18} /> Register User
        </Button>
      </div>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <div style={{ position: 'relative', width: '300px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Search name, username, or roll no..." 
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
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="all">All Roles</option>
                <option value="student">Participants</option>
                <option value="admin">Administrators</option>
              </select>
            </div>
          </div>
          
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Total Users: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{filteredUsers.length}</span>
          </div>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>User Details</th>
                <th>Username</th>
                <th>Role</th>
                <th>Email</th>
                <th>Roll No</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length > 0 ? filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: user.role === 'admin' ? 'var(--accent-purple-dim)' : 'var(--accent-cyan-dim)', border: `1px solid ${user.role === 'admin' ? 'var(--accent-purple)' : 'var(--accent-cyan)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: user.role === 'admin' ? 'var(--accent-purple)' : 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.8rem' }}>
                        {user.name.charAt(0)}
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.name}</div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-code)', fontSize: '0.85rem' }}>{user.username}</td>
                  <td>
                    {user.role === 'admin' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-purple)', background: 'var(--accent-purple-dim)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}><Shield size={12} /> Admin</span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>Student</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{user.email}</td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-code)' }}>{user.rollNo || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <Button variant="ghost" className="btn-icon" style={{ color: 'var(--text-secondary)' }} title="Edit"><Edit size={16} /></Button>
                      <Button variant="ghost" className="btn-icon" style={{ color: 'var(--accent-rose)' }} title="Suspend"><Ban size={16} /></Button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
                    No users found matching your criteria.
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
