import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../hooks/useAuth';

const PublicFooter = () => {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();

  return (
    <footer className="public-footer card">
      <div className="public-footer-copy">
        <strong>{t.footer.tagline}</strong>
        <p>{t.footer.description}</p>
      </div>
      <nav className="public-footer-links" aria-label="Footer">
        <Link to="/pricing">{t.pricing.pricing}</Link>
        <Link to="/agent">{t.agent.title}</Link>
        <Link to={isAuthenticated ? '/dashboard' : '/login'}>
          {isAuthenticated ? t.publicHeader.openDashboard : t.auth.login}
        </Link>
      </nav>
      <p className="public-footer-note">{t.footer.copyright}</p>
    </footer>
  );
};

export default PublicFooter;
