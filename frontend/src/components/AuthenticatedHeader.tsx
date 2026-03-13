import { Link, useLocation } from 'react-router-dom';
import AppLogo from './AppLogo';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../hooks/useAuth';

interface AuthenticatedHeaderProps {
  title: string;
  subtitle?: string;
}

const AuthenticatedHeader = ({ title, subtitle }: AuthenticatedHeaderProps) => {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const location = useLocation();

  const navItems = [
    { to: '/dashboard', label: t.privateHeader.home },
    { to: '/leads', label: t.privateHeader.leads },
    { to: '/whatsapp', label: t.privateHeader.whatsapp },
    { to: '/ai', label: t.privateHeader.ai },
    { to: '/reminders', label: t.privateHeader.reminders },
  ];

  return (
    <header className="page-header app-shell-header">
      <div className="app-shell-left">
        <Link to="/dashboard" className="landing-logo-link" aria-label="EzReply dashboard">
          <AppLogo compact />
        </Link>
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
      </div>

      <div className="app-shell-right">
        <nav className="app-shell-nav" aria-label="Primary">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`app-shell-nav-link ${isActive ? 'app-shell-nav-link-active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="header-actions app-shell-actions">
          <Link to="/" className="btn btn-secondary">
            {t.privateHeader.viewSite}
          </Link>
          <LanguageToggle />
          <ThemeToggle />
          {user ? (
            <div className="auth-chip" title={user.email}>
              <span>{t.privateHeader.signedInLabel}</span>
              <strong>{user.email}</strong>
            </div>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={logout}>
            {t.auth.logout}
          </button>
        </div>
      </div>
    </header>
  );
};

export default AuthenticatedHeader;
