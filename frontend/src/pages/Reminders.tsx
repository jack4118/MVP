import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { remindersApi, Reminder, leadsApi, Lead } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

const Reminders = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'today' | 'upcoming' | 'all'>('today');
  const [status, setStatus] = useState<'all' | 'pending' | 'done'>('pending');
  const [days, setDays] = useState(30);
  const [formData, setFormData] = useState({
    leadId: '',
    type: 'follow_up' as 'follow_up' | 'payment' | 'meeting' | 'custom',
    triggerAt: '',
  });
  const { t } = useLanguage();

  useEffect(() => {
    loadReminders();
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const response = await leadsApi.getLeads();
      if (response.success && response.data) {
        setLeads(response.data);
      }
    } catch (_err) {
      // optional for this page
    }
  };

  const loadReminders = async (nextView = view, nextStatus = status, nextDays = days) => {
    try {
      setLoading(true);
      const response = await remindersApi.getReminders({
        view: nextView,
        status: nextStatus,
        days: nextDays,
      });
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.leadId || !formData.triggerAt) {
      setError('Please select lead and datetime');
      return;
    }

    try {
      const response = await remindersApi.createReminder({
        leadId: formData.leadId,
        type: formData.type,
        triggerAt: new Date(formData.triggerAt).toISOString(),
      });

      if (!response.success) {
        setError(response.error?.message || t.common.error);
        return;
      }

      setFormData({ leadId: '', type: 'follow_up', triggerAt: '' });
      await loadReminders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  };

  const handleMarkDone = async (reminder: Reminder) => {
    try {
      if (reminder.isDone) {
        await remindersApi.updateReminder(reminder.id, { isDone: false });
      } else {
        await remindersApi.markDone(reminder.id);
      }
      await loadReminders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  };

  const handleDelete = async (reminderId: string) => {
    try {
      await remindersApi.deleteReminder(reminderId);
      await loadReminders();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  };

  const getStatusLabel = (statusKey: string) => t.status[statusKey as keyof typeof t.status] || statusKey;

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="header-left">
          <Link to="/dashboard" className="home-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

      <div className="card" style={{ marginBottom: '16px', background: 'linear-gradient(145deg, rgba(255,216,80,0.12), rgba(80,170,255,0.07))' }}>
        <h2 style={{ marginTop: 0 }}>Create Reminder</h2>
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label">Lead</label>
            <select
              className="input"
              value={formData.leadId}
              onChange={(e) => setFormData({ ...formData, leadId: e.target.value })}
            >
              <option value="">-- Select a lead --</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name} ({getStatusLabel(lead.status)})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Type</label>
            <select
              className="input"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as 'follow_up' | 'payment' | 'meeting' | 'custom' })}
            >
              <option value="follow_up">Follow Up</option>
              <option value="payment">Payment</option>
              <option value="meeting">Meeting</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Trigger At</label>
            <input
              className="input"
              type="datetime-local"
              value={formData.triggerAt}
              onChange={(e) => setFormData({ ...formData, triggerAt: e.target.value })}
            />
          </div>

          <button type="submit" className="btn btn-primary">+ Create Reminder</button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
          <div>
            <label className="form-label">View</label>
            <select
              className="input"
              value={view}
              onChange={(e) => {
                const next = e.target.value as 'today' | 'upcoming' | 'all';
                setView(next);
                loadReminders(next, status, days);
              }}
            >
              <option value="today">Today</option>
              <option value="upcoming">Upcoming</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label className="form-label">Status</label>
            <select
              className="input"
              value={status}
              onChange={(e) => {
                const next = e.target.value as 'all' | 'pending' | 'done';
                setStatus(next);
                loadReminders(view, next, days);
              }}
            >
              <option value="pending">Pending</option>
              <option value="done">Done</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label className="form-label">Days (upcoming)</label>
            <input
              className="input"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => {
                const next = Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 30));
                setDays(next);
                loadReminders(view, status, next);
              }}
            />
          </div>

          <button className="btn btn-secondary" onClick={() => loadReminders()}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t.reminders.loadingReminders}</p>
        </div>
      ) : reminders.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">✅</div>
          <h3>{t.reminders.noReminders}</h3>
          <p>{t.reminders.noRemindersMessage}</p>
        </div>
      ) : (
        <div className="reminders-grid">
          {reminders.map((reminder) => (
            <div
              key={reminder.id}
              className="card reminder-card"
              style={{
                border: reminder.isDone ? '1px solid rgba(90,200,120,0.5)' : '1px solid var(--border-color)',
                background: reminder.isDone
                  ? 'linear-gradient(145deg, rgba(70,180,110,0.10), rgba(40,120,90,0.05))'
                  : 'linear-gradient(145deg, rgba(255,255,255,0.03), rgba(120,160,255,0.05))',
              }}
            >
              <div className="reminder-header">
                <div>
                  <h3>{reminder.lead.name}</h3>
                  <div className="reminder-badges">
                    <span className="badge badge-type">{reminder.type}</span>
                    <span className="badge badge-status">{getStatusLabel(reminder.lead.status)}</span>
                    <span className="badge badge-status">{reminder.isDone ? 'done' : 'pending'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={() => handleMarkDone(reminder)} className="btn btn-success">
                    {reminder.isDone ? '↺ Reopen' : `✓ ${t.reminders.markDone}`}
                  </button>
                  <button onClick={() => handleDelete(reminder.id)} className="btn btn-danger">
                    Delete
                  </button>
                </div>
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
