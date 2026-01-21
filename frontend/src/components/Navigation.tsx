import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';

const Navigation = () => {
  const { t } = useLanguage();
  const location = useLocation();
  const isDashboard = location.pathname === '/dashboard';

  if (isDashboard) {
    return null; // Don't show navigation on dashboard
  }

  return (
    <nav className="main-navigation">
      <Link to="/dashboard" className="nav-home-link">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span>{t.common.home}</span>
      </Link>
    </nav>
  );
};

export default Navigation;

