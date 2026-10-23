'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import Sidebar from '@/components/ui/Sidebar';
import TopBar from '@/components/ui/TopBar';
import { Home, Trophy, BookOpen, Clock } from 'lucide-react';
import { studentNav } from '@/lib/navigation';

export default function ClientLayout({ children }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const arenaMode = typeof pathname === 'string' && pathname.includes('/arena');

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push('/');
    } else if (user?.role !== 'STUDENT') {
      router.push('/admin');
    }
  }, [isLoading, isAuthenticated, user, router]);

  if (isLoading || !isAuthenticated || user?.role !== 'STUDENT') {
    return null;
  }

  const studentIcons = {
    Overview: <Home size={20} />,
    Contests: <Trophy size={20} />,
    'Practice Area': <BookOpen size={20} />,
    Submissions: <Clock size={20} />,
  };
  const clientLinks = studentNav.map((item) => ({
    ...item,
    icon: studentIcons[item.name],
  }));

  if (arenaMode) {
    return (
      <div className="page-layout">
        <div className="main-content" style={{ padding: 0, margin: 0, width: '100%' }}>
          <main style={{ padding: 'var(--space-md)' }}>
            {children}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="page-layout">
      <Sidebar links={clientLinks} title="Student" />
      <div className="main-content" style={{ padding: 0 }}>
        <TopBar title="Participant Area" />
        <main style={{ padding: 'var(--space-lg)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
