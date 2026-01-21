import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { remindersApi, Reminder } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

const Reminders = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    loadReminders();
  }, []);

  const loadReminders = async () => {
    try {
      setLoading(true);
      const response = await remindersApi.getTodayReminders();
      if (response.success && response.data) {
        setReminders(response.data);
      } else {
        setError(response.error?.message || t.common.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDone = async (reminderId: string) => {
    try {
      await remindersApi.markDone(reminderId);
      loadReminders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  };

  const getStatusLabel = (status: string) => {
    return t.status[status as keyof typeof t.status] || status;
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t.reminders.loadingReminders}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="header-left">
          <Link to="/dashboard" className="home-link">
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
          </Link>
          <h1 className="page-title">{t.reminders.title}</h1>
        </div>
        <div className="header-actions">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {reminders.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">✅</div>
          <h3>{t.reminders.noReminders}</h3>
          <p>{t.reminders.noRemindersMessage}</p>
        </div>
      ) : (
        <div className="reminders-grid">
          {reminders.map((reminder) => (
            <div key={reminder.id} className="card reminder-card">
              <div className="reminder-header">
                <div>
                  <h3>{reminder.lead.name}</h3>
                  <div className="reminder-badges">
                    <span className="badge badge-type">{reminder.type}</span>
                    <span className="badge badge-status">{getStatusLabel(reminder.lead.status)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleMarkDone(reminder.id)}
                  className="btn btn-success"
                >
                  ✓ {t.reminders.markDone}
                </button>
              </div>
              <div className="reminder-details">
                <div className="detail-item">
                  <span className="detail-label">{t.reminders.contact}:</span>
                  <span>{reminder.lead.contact || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">{t.reminders.triggerTime}:</span>
                  <span>{new Date(reminder.triggerAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Reminders;
