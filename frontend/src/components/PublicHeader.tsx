import { Link } from 'react-router-dom';
import AppLogo from './AppLogo';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../hooks/useAuth';

interface PublicHeaderProps {
  secondaryHref: string;
  secondaryLabel: string;
}

const PublicHeader = ({ secondaryHref, secondaryLabel }: PublicHeaderProps) => {
  const { t } = useLanguage();
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="landing-header">
      <Link to={isAuthenticated ? '/dashboard' : '/'} className="landing-logo-link" aria-label="EzReply">
        <AppLogo />
      </Link>
      <div className="header-actions">
        <Link to="/pricing" className="btn btn-secondary">
          {t.pricing.pricing}
        </Link>
        <Link to={secondaryHref} className="btn btn-secondary">
          {secondaryLabel}
        </Link>
        <LanguageToggle />
        <ThemeToggle />
        {isAuthenticated && user ? (
          <>
            <div className="auth-chip" title={user.email}>
              <span>{t.publicHeader.signedInLabel}</span>
              <strong>{user.email}</strong>
            </div>
            <Link to="/dashboard" className="btn btn-primary">
              {t.publicHeader.openDashboard}
            </Link>
            <button type="button" className="btn btn-secondary" onClick={logout}>
              {t.auth.logout}
            </button>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary">
            {t.common.startFreeTrial}
          </Link>
        )}
      </div>
    </header>
  );
};

export default PublicHeader;
