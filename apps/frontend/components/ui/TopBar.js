import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

export default function TopBar({ title }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="topbar" style={{
      height: 'var(--topbar-height)',
      background: 'rgba(13, 17, 23, 0.8)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-default)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 var(--space-lg)',
      position: 'sticky',
      top: 0,
      zIndex: 10
    }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h2>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
        {user && (
          <div className="sidebar-user" style={{ padding: 0 }}>
            <div className="sidebar-user-info" style={{ alignItems: 'flex-end', marginRight: 'var(--space-sm)' }}>
              <span className="sidebar-user-name">{user.email}</span>
            <span className="sidebar-user-role">{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</span>
            </div>
            <div className="sidebar-avatar" style={{ marginRight: 'var(--space-sm)' }}>
              {(user.email || '?').charAt(0).toUpperCase()}
            </div>
            <button 
              onClick={handleLogout}
              className="btn btn-danger btn-sm"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
