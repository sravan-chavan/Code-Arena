'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import Sidebar from '@/components/ui/Sidebar';
import TopBar from '@/components/ui/TopBar';
import { LayoutDashboard, Users, Code, Activity, Settings, Trophy } from 'lucide-react';

export default function AdminLayout({ children }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return; // wait for session restore (GET /api/auth/me) before deciding
    if (!isAuthenticated) {
      router.push('/');
    } else if (user?.role !== 'ADMIN') {
      router.push('/client');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || !isAuthenticated || user?.role !== 'ADMIN') {
    return null; // Or a loading spinner
  }

  const adminLinks = [
    { name: 'Dashboard', href: '/admin', icon: <LayoutDashboard size={20} /> },
    { name: 'Contests', href: '/admin/contests', icon: <Trophy size={20} /> },
    { name: 'Question Bank', href: '/admin/questions', icon: <Code size={20} /> },
    { name: 'Users', href: '/admin/users', icon: <Users size={20} /> },
    { name: 'System Monitor', href: '/admin/monitor', icon: <Activity size={20} /> },
    { name: 'Settings', href: '/admin/settings', icon: <Settings size={20} /> },
  ];

  return (
    <div className="page-layout">
      <Sidebar links={adminLinks} title="Admin" />
      <div className="main-content" style={{ padding: 0 }}>
        <TopBar title="Administrator Dashboard" />
        <main style={{ padding: 'var(--space-lg)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
