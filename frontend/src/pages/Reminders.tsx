import { useState, useEffect } from 'react';
import { remindersApi, Reminder, ReminderDispatchLog, leadsApi, Lead } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import AuthenticatedHeader from '../components/AuthenticatedHeader';

const Reminders = () => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dispatchLogs, setDispatchLogs] = useState<ReminderDispatchLog[]>([]);
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
    loadDispatchLogs();
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

  const loadDispatchLogs = async () => {
    try {
      const response = await remindersApi.getDispatchLogs(20);
      if (response.success && response.data) {
        setDispatchLogs(response.data);
      }
    } catch (_err) {
      // non-blocking
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.leadId || !formData.triggerAt) {
      setError(t.reminders.leadAndTimeRequired);
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
      <AuthenticatedHeader title={t.reminders.title} subtitle={t.reminders.loadingReminders} />

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: '16px', background: 'linear-gradient(145deg, rgba(255,216,80,0.12), rgba(80,170,255,0.07))' }}>
        <h2 style={{ marginTop: 0 }}>{t.reminders.createReminder}</h2>
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label">{t.reminders.lead}</label>
            <select
              className="input"
              value={formData.leadId}
              onChange={(e) => setFormData({ ...formData, leadId: e.target.value })}
            >
              <option value="">{t.ai.selectLeadPlaceholder}</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.name} ({getStatusLabel(lead.status)})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t.reminders.type}</label>
            <select
              className="input"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as 'follow_up' | 'payment' | 'meeting' | 'custom' })}
            >
              <option value="follow_up">{t.ai.followUp}</option>
              <option value="payment">{t.ai.payment}</option>
              <option value="meeting">Meeting</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t.reminders.triggerAt}</label>
            <input
              className="input"
              type="datetime-local"
              value={formData.triggerAt}
              onChange={(e) => setFormData({ ...formData, triggerAt: e.target.value })}
            />
          </div>

          <button type="submit" className="btn btn-primary">+ {t.reminders.createReminder}</button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div className="reminder-filter-grid">
          <div>
            <label className="form-label">{t.reminders.view}</label>
            <select
              className="input"
              value={view}
              onChange={(e) => {
                const next = e.target.value as 'today' | 'upcoming' | 'all';
                setView(next);
                loadReminders(next, status, days);
              }}
            >
              <option value="today">{t.reminders.today}</option>
              <option value="upcoming">{t.reminders.upcoming}</option>
              <option value="all">{t.reminders.all}</option>
            </select>
          </div>

          <div>
            <label className="form-label">{t.reminders.statusFilter}</label>
            <select
              className="input"
              value={status}
              onChange={(e) => {
                const next = e.target.value as 'all' | 'pending' | 'done';
                setStatus(next);
                loadReminders(view, next, days);
              }}
            >
              <option value="pending">{t.reminders.pending}</option>
              <option value="done">{t.reminders.done}</option>
              <option value="all">{t.reminders.all}</option>
            </select>
          </div>

          <div>
            <label className="form-label">{t.reminders.daysUpcoming}</label>
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

          <button className="btn btn-secondary" onClick={() => { loadReminders(); loadDispatchLogs(); }}>
            {t.reminders.refresh}
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
                    <span className="badge badge-status">{reminder.isDone ? t.reminders.done : t.reminders.pending}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button onClick={() => handleMarkDone(reminder)} className="btn btn-success">
                    {reminder.isDone ? `↺ ${t.reminders.reopen}` : `✓ ${t.reminders.markDone}`}
                  </button>
                  <button onClick={() => handleDelete(reminder.id)} className="btn btn-danger">
                    {t.reminders.deleteAction}
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

      <div className="card" style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>{t.reminders.dispatchLogs}</h2>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              await remindersApi.runDispatchNow();
              await loadReminders();
              await loadDispatchLogs();
            }}
          >
            {t.reminders.runNow}
          </button>
        </div>
        {dispatchLogs.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t.reminders.noDispatchLogs}</p>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {dispatchLogs.map((log) => (
              <div key={log.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <strong>{log.reminder.lead.name}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{new Date(log.sentAt).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {log.channel} • {log.status} • {log.reminder.type}
                </div>
                {log.error && <div style={{ marginTop: '6px', color: 'var(--danger)' }}>{log.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reminders;
