import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage, translate } from '../contexts/LanguageContext';
import { leadsApi, Lead } from '../services/api';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const response = await leadsApi.getLeads();
      if (response.success && response.data) {
        setLeads(response.data);
      }
    } catch (err) {
      // Silently fail - warnings are optional
    } finally {
      setLoading(false);
    }
  };

  const calculateDaysPassed = (lead: Lead): number => {
    const lastActivity = lead.lastActivityAt || lead.createdAt;
    const now = Date.now();
    const activityTime = new Date(lastActivity).getTime();
    return Math.floor((now - activityTime) / (1000 * 60 * 60 * 24));
  };

  const unfollowedCount = leads.filter((lead) => {
    if (lead.status !== 'waiting_reply') return false;
    const daysPassed = calculateDaysPassed(lead);
    return daysPassed > 3;
  }).length;

  const unpaidCount = leads.filter((lead) => lead.status === 'closed').length;

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

      {/* Pain Amplifier Warnings */}
      {!loading && (unfollowedCount > 0 || unpaidCount > 0) && (
        <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {unfollowedCount > 0 && (
            <div
              className="card"
              style={{
                backgroundColor: 'var(--warning)',
                color: 'var(--bg-primary)',
                padding: '16px',
                borderRadius: '8px',
                fontWeight: '500',
              }}
            >
              {translate(t.dashboard.unfollowedWarning, { count: unfollowedCount })}
            </div>
          )}
          {unpaidCount > 0 && (
            <div
              className="card"
              style={{
                backgroundColor: 'var(--success)',
                color: 'var(--bg-primary)',
                padding: '16px',
                borderRadius: '8px',
                fontWeight: '500',
              }}
            >
              {translate(t.dashboard.unpaidWarning, { count: unpaidCount })}
            </div>
          )}
        </div>
      )}

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
