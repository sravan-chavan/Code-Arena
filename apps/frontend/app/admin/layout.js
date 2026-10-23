'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import Sidebar from '@/components/ui/Sidebar';
import TopBar from '@/components/ui/TopBar';
import { LayoutDashboard, Users, Code, Activity, Settings, Trophy, BookOpen } from 'lucide-react';
import { adminNav } from '@/lib/navigation';

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

  const adminIcons = {
    Dashboard: <LayoutDashboard size={20} />,
    Contests: <Trophy size={20} />,
    'Question Bank': <Code size={20} />,
    'Practice Arena': <BookOpen size={20} />,
    Users: <Users size={20} />,
    'System Monitor': <Activity size={20} />,
    Settings: <Settings size={20} />,
  };
  const adminLinks = adminNav.map((item) => ({
    ...item,
    icon: adminIcons[item.name],
  }));

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
