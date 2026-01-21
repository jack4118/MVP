import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage, translate } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t.dashboard.title}</h1>
          <p className="page-subtitle">{translate(t.dashboard.welcomeBack, { email: user?.email || '' })}</p>
        </div>
        <div className="header-actions">
          <LanguageToggle />
          <ThemeToggle />
          <button onClick={logout} className="btn btn-danger">
            {t.auth.logout}
          </button>
        </div>
      </header>

      <nav className="dashboard-nav">
        <Link to="/leads" className="nav-card">
          <div className="nav-icon">👥</div>
          <div>
            <h3>{t.dashboard.leads}</h3>
            <p>{t.dashboard.leadsDescription}</p>
          </div>
        </Link>
        <Link to="/reminders" className="nav-card">
          <div className="nav-icon">⏰</div>
          <div>
            <h3>{t.dashboard.reminders}</h3>
            <p>{t.dashboard.remindersDescription}</p>
          </div>
        </Link>
        <Link to="/ai" className="nav-card">
          <div className="nav-icon">🤖</div>
          <div>
            <h3>{t.dashboard.aiGenerator}</h3>
            <p>{t.dashboard.aiGeneratorDescription}</p>
          </div>
        </Link>
      </nav>

      <div className="card welcome-card">
        <h2>{t.dashboard.welcome}</h2>
        <p>{t.dashboard.welcomeMessage}</p>
      </div>
    </div>
  );
};

export default Dashboard;
