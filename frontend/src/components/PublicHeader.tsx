import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AppLogo from './AppLogo';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../hooks/useAuth';

const PublicHeader = () => {
  const { t } = useLanguage();
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const primaryCtaTarget = isAuthenticated ? '/dashboard' : '/login';

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!menuOpen) {
      document.body.classList.remove('landing-mobile-menu-open');
      return;
    }

    document.body.classList.add('landing-mobile-menu-open');
    return () => {
      document.body.classList.remove('landing-mobile-menu-open');
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const handleWorkflowNavigate = () => {
    closeMenu();
    if (location.pathname !== '/') {
      navigate('/#workflow');
      return;
    }

    window.dispatchEvent(new CustomEvent('ezreply-scroll-workflow'));
  };

  return (
    <header className="landing-header">
      <Link to={isAuthenticated ? '/dashboard' : '/'} className="landing-logo-link" aria-label="EzReply">
        <AppLogo />
      </Link>
      <div className="header-actions landing-mobile-actions">
        <Link to={primaryCtaTarget} className="btn btn-primary landing-mobile-primary-cta">
          {isAuthenticated ? t.publicHeader.openDashboard : t.common.startFreeTrial}
        </Link>
        <button
          type="button"
          className="btn btn-secondary landing-mobile-menu-trigger"
          aria-label={menuOpen ? t.common.close : 'Menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          {menuOpen ? '×' : '☰'}
        </button>
      </div>

      <div className="landing-desktop-actions">
        <Link to={primaryCtaTarget} className="btn btn-primary">
          {isAuthenticated ? t.publicHeader.openDashboard : t.common.startFreeTrial}
        </Link>
        <Link to="/pricing" className="btn btn-secondary">
          {t.landing.seePricing}
        </Link>
        <LanguageToggle />
        <ThemeToggle />
        {isAuthenticated && user ? (
          <>
            <div className="auth-chip" title={user.email}>
              <span>{t.publicHeader.signedInLabel}</span>
              <strong>{user.email}</strong>
            </div>
            <button type="button" className="btn btn-secondary" onClick={logout}>
              {t.auth.logout}
            </button>
          </>
        ) : null}
      </div>

      {menuOpen ? (
        <div className="landing-mobile-menu-sheet" role="dialog" aria-modal="true">
          <nav className="landing-mobile-menu-links">
            <button type="button" className="btn btn-secondary" onClick={handleWorkflowNavigate}>
              {t.landing.heroSecondaryCta}
            </button>
            <Link to="/pricing" className="btn btn-secondary" onClick={closeMenu}>
              {t.landing.seePricing}
            </Link>
            <Link to="/agent" className="btn btn-secondary" onClick={closeMenu}>
              {t.agent.title}
            </Link>
          </nav>
          <div className="landing-mobile-menu-tools">
            <LanguageToggle />
            <ThemeToggle />
          </div>
          {isAuthenticated && user ? (
            <div className="landing-mobile-menu-user">
              <div className="auth-chip" title={user.email}>
                <span>{t.publicHeader.signedInLabel}</span>
                <strong>{user.email}</strong>
              </div>
              <button type="button" className="btn btn-secondary" onClick={logout}>
                {t.auth.logout}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {menuOpen ? <button type="button" className="landing-mobile-overlay" aria-label={t.common.close} onClick={closeMenu}></button> : null}
    </header>
  );
};

export default PublicHeader;
