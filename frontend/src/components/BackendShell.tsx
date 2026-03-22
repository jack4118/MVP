import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FormEvent, ReactNode, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../hooks/useAuth';
import AppLogo from './AppLogo';
import LanguageToggle from './LanguageToggle';
import ThemeToggle from './ThemeToggle';

interface BackendShellProps {
  children: ReactNode;
}

const BackendShell = ({ children }: BackendShellProps) => {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [workspaceSearch, setWorkspaceSearch] = useState('');

  const navItems = [
    { to: '/dashboard', label: t.privateHeader.home, icon: '🏠' },
    { to: '/leads', label: t.privateHeader.leads, icon: '👥' },
    { to: '/reminders', label: t.privateHeader.reminders, icon: '⏰' },
    { to: '/ai', label: t.privateHeader.ai, icon: '✨' },
    { to: '/whatsapp', label: t.privateHeader.whatsapp, icon: '💬' },
    { to: '/app/pricing', label: t.pricing.pricing, icon: '💳' },
    { to: '/app/agent', label: t.agent.title, icon: '🤝' },
    { to: '/settings', label: t.privateHeader.profile, icon: '⚙️' },
  ];

  const searchableItems = [...navItems, { to: '/', label: t.privateHeader.viewSite, icon: '🌐' }];

  const handleWorkspaceSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = workspaceSearch.trim().toLowerCase();
    if (!query) return;

    if (query.startsWith('/')) {
      navigate(query);
      setWorkspaceSearch('');
      return;
    }

    const matched = searchableItems.find((item) => item.label.toLowerCase().includes(query));
    if (matched) {
      navigate(matched.to);
      setWorkspaceSearch('');
    }
  };

  return (
    <div className={`backend-shell ${collapsed ? 'backend-shell-collapsed' : ''}`}>
      <aside className={`backend-sidebar ${collapsed ? 'backend-sidebar-collapsed' : ''}`}>
        <div className="backend-sidebar-brand">
          <Link to="/dashboard" className="landing-logo-link">
            <AppLogo compact />
          </Link>
          <button type="button" className="btn btn-secondary" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? '→' : '←'}
          </button>
        </div>
        <nav className="backend-sidebar-nav" aria-label="Sidebar">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`backend-sidebar-link ${active ? 'backend-sidebar-link-active' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <span>{item.icon}</span>
                {!collapsed ? <span>{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="backend-main">
        <header className="backend-topbar">
          <div className="backend-topbar-left">
            <form onSubmit={handleWorkspaceSearch}>
              <input
                className="input backend-search"
                placeholder={t.common.search}
                aria-label={t.common.search}
                value={workspaceSearch}
                onChange={(e) => setWorkspaceSearch(e.target.value)}
              />
            </form>
          </div>
          <div className="backend-topbar-right">
            <Link to="/" className="btn btn-secondary">
              {t.privateHeader.viewSite}
            </Link>
            <span className="task-pill">{t.privateHeader.unreadLabel}</span>
            <LanguageToggle />
            <ThemeToggle />
            {user ? (
              <div className="auth-chip" title={user.email}>
                <span>{t.privateHeader.signedInLabel}</span>
                <strong>{user.displayName || user.companyName || user.email}</strong>
              </div>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={logout}>
              {t.auth.logout}
            </button>
          </div>
        </header>

        <main className="backend-content">{children}</main>
      </div>
    </div>
  );
};

export default BackendShell;
