'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import Button from '@/components/ui/Button';
import { validateRegistration } from '@/lib/authValidation';

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { login, register } = useAuth();

  function switchMode(next) {
    setMode(next);
    setError('');
    setSuccess('');
    setPassword('');
    setConfirmPassword('');
  }

  function redirectForUser(user) {
    if (user.role === 'ADMIN') {
      router.push('/admin');
      return;
    }
    router.push('/client');
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        redirectForUser(result.user);
      } else {
        setError(result.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const validationMessage = validateRegistration({ email, password, confirmPassword });
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setIsLoading(true);
    try {
      const result = await register(email, password);
      if (result.success) {
        redirectForUser(result.user);
      } else {
        setError(result.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-md)',
      position: 'relative'
    }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '50%', height: '50%', borderRadius: '50%', background: 'var(--accent-cyan-dim)', filter: 'blur(120px)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '50%', height: '50%', borderRadius: '50%', background: 'var(--accent-purple-dim)', filter: 'blur(120px)' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)' }}>
          <h1 style={{
            fontSize: '2.5rem',
            fontWeight: 900,
            marginBottom: 'var(--space-xs)',
            fontFamily: 'var(--font-display)',
            background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            CodeArena
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Lab-Based Coding Competition Platform</p>
        </div>

        <div className="card">
          <div
            role="tablist"
            aria-label="Authentication"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`btn ${mode === 'login' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`btn ${mode === 'register' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchMode('register')}
            >
              Register
            </button>
          </div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-lg)' }}>
            {mode === 'register' ? 'Create Student Account' : 'Access Terminal'}
          </h2>

          {error && (
            <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.2)', color: 'var(--accent-rose)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', color: 'var(--accent-emerald)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-lg)', fontSize: '0.875rem' }}>
              {success}
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="form-group">
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input"
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button type="submit" fullWidth disabled={isLoading} className="btn-lg">
                {isLoading ? 'Authenticating...' : 'Initialize Session'}
              </Button>
            </form>
          ) : (
            <form noValidate onSubmit={handleRegister}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
                Registration creates a student account. Role is assigned by the server.
              </p>
              <div className="form-group">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="form-group">
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="form-group">
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="form-input"
                  autoComplete="new-password"
                  required
                />
              </div>
              <Button type="submit" fullWidth disabled={isLoading} className="btn-lg">
                {isLoading ? 'Creating account...' : 'Create account'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
