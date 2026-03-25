import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { remindersApi, Reminder, ReminderDispatchLog, leadsApi, Lead } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import AuthenticatedHeader from '../components/AuthenticatedHeader';

const Reminders = () => {
  const navigate = useNavigate();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const [dispatchLogs, setDispatchLogs] = useState<ReminderDispatchLog[]>([]);
  const [dispatchStatusFilter, setDispatchStatusFilter] = useState<'all' | 'sent' | 'failed' | 'requires_template' | 'skipped'>('all');
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

  const loadReminders = async (nextDays = days) => {
    try {
      setLoading(true);
      const response = await remindersApi.getReminders({
        view: 'all',
        status: 'pending',
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

  const loadDispatchLogs = async (nextStatus: 'all' | 'sent' | 'failed' | 'requires_template' | 'skipped' = dispatchStatusFilter) => {
    try {
      const response = await remindersApi.getDispatchLogs(20, nextStatus === 'all' ? undefined : nextStatus);
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

  const getStatusLabel = (statusKey: string) => t.status[statusKey as keyof typeof t.status] || statusKey;

  const handleMarkDone = async (reminder: Reminder) => {
    try {
      setError('');
      setSuccess('');
      await remindersApi.markDone(reminder.id);
      setSuccess(t.reminders.taskClearedSuccess.replace('{name}', reminder.lead.name));
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

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const pendingReminders = reminders
    .filter((reminder) => !reminder.isDone)
    .sort((a, b) => new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime());

  const overdueReminders = pendingReminders.filter((reminder) => new Date(reminder.triggerAt).getTime() < now.getTime());
  const todayReminders = pendingReminders.filter((reminder) => {
    const trigger = new Date(reminder.triggerAt).getTime();
    return trigger >= now.getTime() && trigger < endOfToday.getTime();
  });
  const upcomingReminders = pendingReminders.filter((reminder) => new Date(reminder.triggerAt).getTime() >= endOfToday.getTime());

  const nextTask = overdueReminders[0] || todayReminders[0] || upcomingReminders[0] || null;

  const buildInboxTaskLink = (reminder: Reminder) => {
    const params = new URLSearchParams({
      view: 'inbox',
      phone: reminder.lead.contact || '',
      reminderId: reminder.id,
      leadId: reminder.lead.id,
      source: 'reminders',
    });
    return `/whatsapp?${params.toString()}`;
  };

  const renderReminderTask = (reminder: Reminder, priority: 'overdue' | 'today' | 'upcoming') => (
    <div
      key={reminder.id}
      className={`card reminder-card ${priority === 'overdue' ? 'reminder-card-overdue' : 'reminder-card-pending'}`}
    >
      <div className="reminder-header">
        <div>
          <h3>{t.reminders.taskTitle.replace('{name}', reminder.lead.name)}</h3>
          <div className="reminder-badges">
            <span className="badge badge-type">{reminder.type}</span>
            <span className="badge badge-status">{getStatusLabel(reminder.lead.status)}</span>
            <span className={`badge badge-status ${priority === 'overdue' ? 'badge-status-overdue' : ''}`}>
              {priority === 'overdue'
                ? t.reminders.overdueSectionTitle
                : priority === 'today'
                  ? t.reminders.todaySectionTitle
                  : t.reminders.upcomingSectionTitle}
            </span>
          </div>
        </div>
        <div className="reminder-actions-row">
          <button onClick={() => handleMarkDone(reminder)} className="btn btn-primary">
            {t.reminders.clearTask}
          </button>
          <details className="reminder-secondary-actions">
            <summary>{t.reminders.moreActions}</summary>
            <div className="reminder-secondary-actions-menu">
              {reminder.lead.contact ? (
                <Link to={`/whatsapp?view=inbox&phone=${encodeURIComponent(reminder.lead.contact)}`} className="btn btn-secondary">
                  {t.reminders.openInInbox}
                </Link>
              ) : null}
              <button onClick={() => handleDelete(reminder.id)} className="btn btn-secondary">
                {t.reminders.deleteAction}
              </button>
            </div>
          </details>
        </div>
      </div>

      <div className="reminder-details">
        <div className="detail-item">
          <span className="detail-label">{t.reminders.contact}:</span>
          <span>{reminder.lead.contact || t.reminders.notAvailable}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">{t.reminders.triggerTime}:</span>
          <span>{new Date(reminder.triggerAt).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-container">
      <AuthenticatedHeader title={t.reminders.title} subtitle={t.reminders.actionFlowSubtitle} />

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <span>{success}</span>
        </div>
      )}

      <div className="card reminders-create-card">
        <h2 className="reminders-card-title">{t.reminders.createReminder}</h2>
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
              <option value="meeting">{t.reminders.meetingType}</option>
              <option value="custom">{t.reminders.customType}</option>
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

      <div className="card reminders-filter-card">
        <div className="reminder-filter-grid">
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
                loadReminders(next);
              }}
            />
          </div>

          {nextTask?.lead.contact ? (
            <Link to={`/whatsapp?view=inbox&phone=${encodeURIComponent(nextTask.lead.contact)}`} className="btn btn-primary">
              {t.reminders.processNextTask}
            </Link>
          ) : (
            <button className="btn btn-primary" disabled>
              {t.reminders.processNextTask}
            </button>
          )}

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
      ) : pendingReminders.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">✅</div>
          <h3>{t.reminders.emptyQueueTitle}</h3>
          <p>{t.reminders.emptyQueueBody}</p>
        </div>
      ) : (
        <div className="reminders-grid">
          <section className="card reminders-section reminders-section-overdue">
            <div className="section-heading">
              <h2>{t.reminders.overdueSectionTitle}</h2>
              <span className="status-chip status-chip-danger">{overdueReminders.length}</span>
            </div>
            <p className="page-subtitle">{t.reminders.overdueSectionBody}</p>
            {overdueReminders.length === 0 ? (
              <div className="dashboard-panel-state">
                <p>{t.reminders.noOverdue}</p>
              </div>
            ) : (
              <div className="reminders-section-list">
                {overdueReminders.map((reminder) => renderReminderTask(reminder, 'overdue'))}
              </div>
            )}
          </section>

          <section className={`card reminders-section ${overdueReminders.length > 0 ? 'reminders-section-muted' : ''}`}>
            <div className="section-heading">
              <h2>{t.reminders.todaySectionTitle}</h2>
              <span className="status-chip status-chip-warning">{todayReminders.length}</span>
            </div>
            <p className="page-subtitle">{t.reminders.todaySectionBody}</p>
            {todayReminders.length === 0 ? (
              <div className="dashboard-panel-state">
                <p>{t.reminders.noTodayTasks}</p>
              </div>
            ) : (
              <div className="reminders-section-list">
                {todayReminders.map((reminder) => renderReminderTask(reminder, 'today'))}
              </div>
            )}
          </section>

          <section className={`card reminders-section ${overdueReminders.length > 0 ? 'reminders-section-muted' : ''}`}>
            <div className="section-heading">
              <h2>{t.reminders.upcomingSectionTitle}</h2>
              <span className="status-chip status-chip-info">{upcomingReminders.length}</span>
            </div>
            <p className="page-subtitle">{t.reminders.upcomingSectionBody}</p>
            {upcomingReminders.length === 0 ? (
              <div className="dashboard-panel-state">
                <p>{t.reminders.noUpcomingTasks}</p>
              </div>
            ) : (
              <div className="reminders-section-list">
                {upcomingReminders.map((reminder) => renderReminderTask(reminder, 'upcoming'))}
              </div>
            )}
          </section>
        </div>
      )}

      <div className="card reminders-logs-card">
        <div className="reminders-logs-header">
          <h2 className="reminders-card-title">{t.reminders.dispatchLogs}</h2>
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
          <select
            className="input"
            value={dispatchStatusFilter}
            onChange={(e) => {
              const next = e.target.value as 'all' | 'sent' | 'failed' | 'requires_template' | 'skipped';
              setDispatchStatusFilter(next);
              void loadDispatchLogs(next);
            }}
          >
            <option value="all">{t.reminders.all}</option>
            <option value="sent">{t.reminders.dispatchStatusSent}</option>
            <option value="failed">{t.reminders.dispatchStatusFailed}</option>
            <option value="requires_template">{t.reminders.dispatchStatusRequiresTemplate}</option>
            <option value="skipped">{t.reminders.dispatchStatusSkipped}</option>
          </select>
        </div>
        {dispatchLogs.length === 0 ? (
          <p className="reminders-muted">{t.reminders.noDispatchLogs}</p>
        ) : (
          <div className="reminders-logs-grid">
            {dispatchLogs.map((log) => (
              <div key={log.id} className="reminders-log-item">
                <div className="reminders-log-item-head">
                  <strong>{log.reminder.lead.name}</strong>
                  <span className="reminders-log-item-time">{new Date(log.sentAt).toLocaleString()}</span>
                </div>
                <div className="reminders-log-item-meta">
                  {log.channel} • {log.status} • {log.reminder.type}
                </div>
                {log.error && <div className="reminders-log-item-error">{log.error}</div>}
                {(log.status === 'failed' || log.status === 'requires_template') && (
                  <div className="reminders-log-item-actions">
                    <button
                      className="btn btn-secondary"
                      disabled={retryingLogId === log.id}
                      onClick={async () => {
                        try {
                          setRetryingLogId(log.id);
                          setError('');
                          setSuccess('');
                          const resp = await remindersApi.retryDispatchLog(log.id);
                          if (!resp.success) {
                            setError(resp.error?.message || t.common.error);
                          } else if (resp.data?.retried) {
                            setSuccess(t.reminders.retrySuccess);
                          } else {
                            setError(resp.data?.reason || t.common.error);
                          }
                          await loadDispatchLogs();
                        } finally {
                          setRetryingLogId(null);
                        }
                      }}
                    >
                      {retryingLogId === log.id ? t.common.loading : t.reminders.retry}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reminders;
