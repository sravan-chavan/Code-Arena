'use client';
import { useEffect, useRef, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatDate } from '@/lib/mockData';
import { ApiError } from '@/lib/apiClient';
import { fetchAdminUsers, registerAdminUser } from '@/lib/usersApi';
import {
  ADMIN_USER_PAGE_SIZE,
  presentAdminUser,
  registrationFailure,
  registrationFieldErrors,
  userListViewState,
  userTotalLabel,
} from '@/lib/usersAdmin';
import { Search, Shield, User, Filter, Edit, Ban } from 'lucide-react';

const fieldErrorStyle = {
  color: 'var(--accent-rose)',
  fontSize: '0.8rem',
  marginTop: '6px',
};

export default function AdminUsers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalUsers, setTotalUsers] = useState(null);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const skipSearchReset = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchTerm.trim();
      setDebouncedSearch((current) => (current === next ? current : next));
      if (skipSearchReset.current) {
        skipSearchReset.current = false;
        return;
      }
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const data = await fetchAdminUsers({
          search: debouncedSearch,
          role: roleFilter,
          page,
          pageSize: ADMIN_USER_PAGE_SIZE,
        });
        if (cancelled) return;
        setUsers(data.users.map(presentAdminUser));
        setTotal(data.total);
        setTotalUsers(data.totalUsers);
        setPageCount(data.pageCount || 1);
        setLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Unable to load users.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, roleFilter, page, reloadToken]);

  useEffect(() => {
    if (!showRegister) return undefined;
    function onKey(event) {
      if (event.key === 'Escape' && !submitting.current) {
        setShowRegister(false);
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setFieldErrors({});
        setFormError('');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showRegister]);

  const filtered = Boolean(debouncedSearch || roleFilter !== 'all');
  const view = userListViewState({
    loaded,
    error,
    users,
    totalUsers: totalUsers ?? 0,
    filtered,
  });
  const totalLabel = userTotalLabel({ loaded, error, totalUsers });
  const summaryError = formError && !Object.values(fieldErrors).includes(formError) ? formError : '';

  function closeModal() {
    if (submitting.current) return;
    setShowRegister(false);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFieldErrors({});
    setFormError('');
  }

  async function handleRegister(event) {
    event.preventDefault();
    if (submitting.current) return;
    const nextFieldErrors = registrationFieldErrors({ email, password, confirmPassword });
    const firstError = nextFieldErrors.email || nextFieldErrors.password || nextFieldErrors.confirmPassword;
    if (firstError) {
      setFieldErrors(nextFieldErrors);
      setFormError(firstError);
      return;
    }

    submitting.current = true;
    setSaving(true);
    setFieldErrors({});
    setFormError('');
    try {
      const created = await registerAdminUser({ email, password });
      setSuccess(`Student account created for ${created.email}.`);
      setShowRegister(false);
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setSearchTerm('');
      setDebouncedSearch('');
      setRoleFilter('all');
      setPage(1);
      setReloadToken((value) => value + 1);
    } catch (err) {
      const failure = registrationFailure(err);
      setFieldErrors(failure.fieldErrors);
      setFormError(failure.message);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-lg)' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, background: 'linear-gradient(135deg, var(--text-primary), var(--accent-cyan))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontFamily: 'var(--font-display)' }}>USERS Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Manage user accounts, roles, and access controls.</p>
        </div>
        <Button variant="primary" className="btn-lg" onClick={() => { setSuccess(''); setShowRegister(true); }}>
          <User size={18} /> Register User
        </Button>
      </div>

      {success ? (
        <p role="status" style={{ color: 'var(--accent-emerald)', fontSize: '0.9rem' }}>{success}</p>
      ) : null}

      {error && view !== 'error' ? (
        <div role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-md)', color: 'var(--accent-rose)' }}>
          <span>{error}</span>
          <Button variant="secondary" onClick={() => setReloadToken((value) => value + 1)}>Try again</Button>
        </div>
      ) : null}

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '300px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                aria-label="Search users by email"
                placeholder="Search by email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '36px', paddingBottom: '8px', paddingTop: '8px' }}
              />
            </div>

            <div style={{ position: 'relative' }}>
              <Filter size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <select
                aria-label="Filter by role"
                className="form-select"
                style={{ paddingLeft: '36px', paddingBottom: '8px', paddingTop: '8px', height: '100%', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All Roles</option>
                <option value="STUDENT">Participants</option>
                <option value="ADMIN">Administrators</option>
              </select>
            </div>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Total Users: <span data-testid="total-users" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{totalLabel}</span>
            {filtered && loaded ? (
              <span> · Matching <span data-testid="matching-users">{total}</span></span>
            ) : null}
            {loading && loaded ? <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>Updating…</span> : null}
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
              {view === 'loading' ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
                    Loading users…
                  </td>
                </tr>
              ) : null}
              {view === 'error' ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
                    <p role="alert" style={{ color: 'var(--accent-rose)', marginBottom: 'var(--space-md)' }}>{error}</p>
                    <Button variant="secondary" onClick={() => setReloadToken((value) => value + 1)}>Try again</Button>
                  </td>
                </tr>
              ) : null}
              {view === 'empty' ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
                    No users are registered.
                  </td>
                </tr>
              ) : null}
              {view === 'no-matches' ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-secondary)' }}>
                    No users found matching your criteria.
                  </td>
                </tr>
              ) : null}
              {view === 'ready' ? users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: user.isAdmin ? 'var(--accent-purple-dim)' : 'var(--accent-cyan-dim)', border: `1px solid ${user.isAdmin ? 'var(--accent-purple)' : 'var(--accent-cyan)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: user.isAdmin ? 'var(--accent-purple)' : 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.8rem' }}>
                        {user.initial}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.displayName}</div>
                        {user.createdAt ? (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Joined {formatDate(user.createdAt)}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td title="Username is not stored" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-code)', fontSize: '0.85rem' }}>{user.username}</td>
                  <td>
                    {user.isAdmin ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-purple)', background: 'var(--accent-purple-dim)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}><Shield size={12} /> Admin</span>
                    ) : user.role === 'STUDENT' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>Student</span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>—</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{user.email}</td>
                  <td title="Roll number is not stored" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-code)' }}>{user.rollNo}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <Button variant="ghost" className="btn-icon" disabled title="Editing is not available. User profiles are not stored." aria-label="Edit unavailable" style={{ color: 'var(--text-secondary)' }}><Edit size={16} /></Button>
                      <Button variant="ghost" className="btn-icon" disabled title="Suspension is not available. Accounts have no status field." aria-label="Suspend unavailable" style={{ color: 'var(--accent-rose)' }}><Ban size={16} /></Button>
                    </div>
                  </td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>

        {pageCount > 1 ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
            <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Page {page} of {pageCount}</span>
            <Button variant="secondary" disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)}>Next</Button>
          </div>
        ) : null}
      </Card>

      {showRegister ? (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-user-title"
            style={{ maxWidth: '480px' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2 id="register-user-title" className="modal-title">Register User</h2>
              <button type="button" className="modal-close" onClick={closeModal} aria-label="Close" disabled={saving}>×</button>
            </div>
            <form noValidate onSubmit={handleRegister}>
              <div className="modal-body">
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
                  This creates a student account with the same checks as public registration. Administrator accounts are not created here.
                </p>
                {summaryError ? (
                  <div role="alert" style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', color: 'var(--accent-rose)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)', fontSize: '0.875rem' }}>
                    {summaryError}
                  </div>
                ) : null}
                <div className="form-group">
                  <label className="form-label" htmlFor="register-email">Email</label>
                  <input
                    id="register-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="form-input"
                    autoComplete="off"
                    aria-invalid={fieldErrors.email ? 'true' : 'false'}
                    aria-describedby={fieldErrors.email ? 'register-email-error' : undefined}
                    autoFocus
                  />
                  {fieldErrors.email ? <p id="register-email-error" style={fieldErrorStyle}>{fieldErrors.email}</p> : null}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-password">Password</label>
                  <input
                    id="register-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="form-input"
                    autoComplete="new-password"
                    aria-invalid={fieldErrors.password ? 'true' : 'false'}
                    aria-describedby={fieldErrors.password ? 'register-password-error' : undefined}
                  />
                  {fieldErrors.password ? <p id="register-password-error" style={fieldErrorStyle}>{fieldErrors.password}</p> : null}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="register-confirm">Confirm password</label>
                  <input
                    id="register-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="form-input"
                    autoComplete="new-password"
                    aria-invalid={fieldErrors.confirmPassword ? 'true' : 'false'}
                    aria-describedby={fieldErrors.confirmPassword ? 'register-confirm-error' : undefined}
                  />
                  {fieldErrors.confirmPassword ? <p id="register-confirm-error" style={fieldErrorStyle}>{fieldErrors.confirmPassword}</p> : null}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" htmlFor="register-role">Role</label>
                  <input id="register-role" className="form-input" value="Student" readOnly aria-readonly="true" />
                </div>
              </div>
              <div className="modal-footer">
                <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? 'Creating account…' : 'Create student account'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
