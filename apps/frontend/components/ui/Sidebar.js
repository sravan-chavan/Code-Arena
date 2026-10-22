import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar({ links, title }) {
  const pathname = usePathname();

  return (
    <div className="sidebar">
      <div className="sidebar-brand">
        <img
          src="/favicon.svg"
          alt="CodeArena logo"
          width={44}
          height={44}
          style={{ flexShrink: 0 }}
        />
        <div className="sidebar-brand-text">
          <h2>CodeArena</h2>
          <span>{title}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <ul>
          {links.map((link) => {
            const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
            return (
              <li key={link.name}>
                <Link
                  href={link.href}
                  className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="sidebar-nav-icon">{link.icon}</span>
                  {link.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          CodeArena v2.0
        </div>
      </div>
    </div>
  );
}