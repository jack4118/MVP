import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  dashboardApi,
  DashboardSummary,
  leadsApi,
  Lead,
  remindersApi,
  whatsappApi,
} from '../services/api';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import AppLogo from '../components/AppLogo';
import AiComposerFields from '../components/AiComposerFields';
import AiStatusPanel from '../components/AiStatusPanel';
import {
  createInitialAiConfig,
  generateAiMessage,
  GenerationStage,
  getDefaultQuickConfigForLead,
  SharedAiConfig,
} from '../features/ai/shared';
import { useLanguage } from '../contexts/LanguageContext';

const actionLabels: Record<string, string> = {
  send_follow_up: 'Send follow-up',
  ask_budget: 'Ask budget',
  payment_reminder: 'Payment reminder',
  mark_won: 'Mark won',
  snooze: 'Snooze 2 days',
};

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { language } = useLanguage();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showQuickActionModal, setShowQuickActionModal] = useState(false);
  const [activeTask, setActiveTask] = useState<DashboardSummary['todayTasks'][number] | null>(null);
  const [config, setConfig] = useState<SharedAiConfig>(createInitialAiConfig());
  const [generatedText, setGeneratedText] = useState('');
  const [generationStage, setGenerationStage] = useState<GenerationStage>('ready');
  const [generationDebug, setGenerationDebug] = useState<any>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const response = await dashboardApi.getSummary();
      if (response.success && response.data) {
        setSummary(response.data);
      } else {
        setError(response.error?.message || 'Failed to load dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(
    () => [
      { label: 'Today tasks', value: String(summary?.todayTasks.length || 0) },
      { label: 'Overdue follow-ups', value: String(summary?.overdueFollowUps || 0) },
      { label: 'Waiting payment', value: String(summary?.waitingPayment || 0) },
      { label: 'Recently replied', value: String(summary?.recentlyReplied.length || 0) },
    ],
    [summary]
  );

  const onboardingSteps = useMemo(
    () => [
      {
        label: 'Connect WhatsApp',
        done: !!summary?.onboarding.hasConnectedWhatsApp,
        hint: summary?.onboarding.connectedDisplayPhone
          ? `Connected: ${summary.onboarding.connectedDisplayPhone}`
          : 'Connect your WhatsApp API first.',
        cta: '/whatsapp',
      },
      {
        label: 'Add your first lead',
        done: !!summary?.onboarding.hasLeads,
        hint: summary?.onboarding.hasLeads
          ? `${summary.onboarding.totalLeads} lead(s) saved`
          : 'Import or create at least one customer record.',
        cta: '/leads',
      },
      {
        label: 'Send the first follow-up',
        done: !!summary?.onboarding.hasSentFollowUp,
        hint: summary?.onboarding.hasSentFollowUp
          ? `${summary.onboarding.sentMessagesCount} message(s) sent`
          : 'Use a quick action to generate and send your first WhatsApp draft.',
        cta: '/leads',
      },
    ],
    [summary]
  );

  const openQuickAction = (task: DashboardSummary['todayTasks'][number], action: string) => {
    const lead: Lead = {
      id: task.lead.id,
      userId: user?.id || '',
      name: task.lead.name,
      contact: task.lead.contact || undefined,
      notes: '',
      status: task.lead.status,
      lastActivityAt: task.lead.lastOutboundAt || task.lead.lastInboundAt || task.triggerAt,
      lastInboundAt: task.lead.lastInboundAt || undefined,
      lastOutboundAt: task.lead.lastOutboundAt || undefined,
      nextFollowUpAt: task.lead.nextFollowUpAt || undefined,
      closedReason: null,
      createdAt: task.triggerAt,
    };

    const baseConfig = getDefaultQuickConfigForLead(lead, 0);
    const objectiveByAction: Record<string, Partial<SharedAiConfig>> = {
      send_follow_up: {
        purpose: 'follow-up',
        objective: 'Send a concise follow-up and ask for a clear next step.',
      },
      ask_budget: {
        purpose: 'follow-up',
        objective: 'Ask for budget, package fit, and next-step timing.',
      },
      payment_reminder: {
        purpose: 'payment',
        objective: 'Follow up on payment and ask for a clear payment date.',
      },
    };

    setActiveTask(task);
    setConfig({
      ...baseConfig,
      outputFormat: 'whatsapp',
      ...(objectiveByAction[action] || objectiveByAction.send_follow_up),
    });
    setGeneratedText('');
    setGenerationDebug(null);
    setGenerationStage('ready');
    setAdvancedOpen(false);
    setShowQuickActionModal(true);
  };

  const closeQuickActionModal = () => {
    if (aiLoading || sending) {
      return;
    }
    setShowQuickActionModal(false);
    setActiveTask(null);
    setConfig(createInitialAiConfig());
    setGeneratedText('');
    setGenerationDebug(null);
    setGenerationStage('ready');
    setAdvancedOpen(false);
  };

  const handleGenerate = async () => {
    if (!activeTask) {
      return;
    }

    const lead: Lead = {
      id: activeTask.lead.id,
      userId: user?.id || '',
      name: activeTask.lead.name,
      contact: activeTask.lead.contact || undefined,
      notes: '',
      status: activeTask.lead.status,
      lastActivityAt: activeTask.lead.lastOutboundAt || activeTask.lead.lastInboundAt || activeTask.triggerAt,
      lastInboundAt: activeTask.lead.lastInboundAt || undefined,
      lastOutboundAt: activeTask.lead.lastOutboundAt || undefined,
      nextFollowUpAt: activeTask.lead.nextFollowUpAt || undefined,
      closedReason: null,
      createdAt: activeTask.triggerAt,
    };

    setAiLoading(true);
    setGenerationStage('thinking');
    setGeneratedText('');
    setGenerationDebug(null);
    setError('');

    try {
      const response = await generateAiMessage({ config, lead, language });
      if (response.success && response.data) {
        setGeneratedText(response.data.text);
        setGenerationDebug(response.data.debug || null);
        setGenerationStage('done');
        return;
      }

      setGenerationStage('ready');
      setError(response.error?.message || 'Failed to generate message');
    } catch (err) {
      setGenerationStage('ready');
      setError(err instanceof Error ? err.message : 'Failed to generate message');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSend = async () => {
    if (!activeTask?.lead.contact || !generatedText.trim()) {
      setError('Lead needs a WhatsApp number and generated message before sending.');
      return;
    }

    try {
      setSending(true);
      setError('');
      await whatsappApi.sendText({
        leadId: activeTask.lead.id,
        toPhone: activeTask.lead.contact,
        content: generatedText.trim(),
      });
      await remindersApi.markDone(activeTask.id);
      await loadSummary();
      closeQuickActionModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleTaskAction = async (task: DashboardSummary['todayTasks'][number], action: string) => {
    if (action === 'mark_won') {
      await leadsApi.updateLeadStatus(task.lead.id, 'won');
      await remindersApi.markDone(task.id);
      await loadSummary();
      return;
    }

    if (action === 'snooze') {
      const trigger = new Date();
      trigger.setDate(trigger.getDate() + 2);
      await leadsApi.updateLead(task.lead.id, { nextFollowUpAt: trigger.toISOString(), status: 'waiting_reply' });
      await loadSummary();
      return;
    }

    openQuickAction(task, action);
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <AppLogo />
          <h1 className="page-title">Today Tasks</h1>
          <p className="page-subtitle">Open once, see who needs attention, and send the next message.</p>
          <p className="page-subtitle">Signed in as {user?.email || 'user'}</p>
        </div>
        <div className="header-actions">
          <Link to="/pricing" className="btn btn-secondary">
            Pricing
          </Link>
          <LanguageToggle />
          <ThemeToggle />
          <button onClick={logout} className="btn btn-danger">
            Logout
          </button>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="today-stats-grid">
        {stats.map((card) => (
          <article key={card.label} className="card stat-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </section>

      <section className="card hero-card">
        <p className="eyebrow">WhatsApp Follow-up System</p>
        <h2>Never forget to follow up your customers again.</h2>
        <p>
          EzReply is no longer framed as an AI reply toy. It is your daily follow-up control panel for leads,
          payment reminders, and next actions.
        </p>
      </section>

      <section className="card">
        <div className="section-heading">
          <h3>Onboarding checklist</h3>
          <span>{onboardingSteps.filter((step) => step.done).length}/3 done</span>
        </div>
        <div className="simple-list">
          {onboardingSteps.map((step) => (
            <div key={step.label} className="simple-list-item">
              <div>
                <strong>{step.done ? '✓' : '○'} {step.label}</strong>
                <p>{step.hint}</p>
              </div>
              {!step.done && (
                <Link to={step.cta} className="btn btn-secondary">
                  Open
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="today-dashboard-grid">
        <article className="card">
          <div className="section-heading">
            <h3>Today follow-ups</h3>
            <button className="btn btn-secondary" onClick={loadSummary}>
              Refresh
            </button>
          </div>
          {loading ? (
            <p>Loading tasks...</p>
          ) : summary?.todayTasks.length ? (
            <div className="today-task-list">
              {summary.todayTasks.map((task) => (
                <div key={task.id} className="today-task-card">
                  <div className="today-task-top">
                    <div>
                      <strong>{task.lead.name}</strong>
                      <p>{task.lead.contact || 'No WhatsApp number saved'}</p>
                    </div>
                    <span className={`task-pill ${task.isOverdue ? 'task-pill-overdue' : ''}`}>
                      {task.isOverdue ? 'Overdue' : new Date(task.triggerAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="today-task-meta">
                    {task.type === 'payment' ? 'Payment follow-up' : 'Customer follow-up'} • {task.lead.status}
                  </p>
                  <div className="today-task-actions">
                    {task.suggestedActions.map((action) => (
                      <button
                        key={action}
                        className={`btn ${action === 'mark_won' ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => handleTaskAction(task, action)}
                      >
                        {actionLabels[action] || action}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No tasks due today.</p>
          )}
        </article>

        <article className="card">
          <div className="section-heading">
            <h3>Recently replied</h3>
            <Link to="/whatsapp" className="btn btn-secondary">
              Open WhatsApp
            </Link>
          </div>
          {summary?.recentlyReplied.length ? (
            <div className="simple-list">
              {summary.recentlyReplied.map((lead) => (
                <div key={lead.id} className="simple-list-item">
                  <div>
                    <strong>{lead.name}</strong>
                    <p>{lead.contact || 'No contact'}</p>
                  </div>
                  <span>{lead.lastInboundAt ? new Date(lead.lastInboundAt).toLocaleString() : 'Just now'}</span>
                </div>
              ))}
            </div>
          ) : (
            <p>No recent replies yet.</p>
          )}
        </article>
      </section>

      <section className="dashboard-nav">
        <Link to="/leads" className="nav-card">
          <div className="nav-icon">👥</div>
          <div>
            <h3>Leads</h3>
            <p>Customer records and quick actions</p>
          </div>
        </Link>
        <Link to="/whatsapp" className="nav-card">
          <div className="nav-icon">💬</div>
          <div>
            <h3>WhatsApp</h3>
            <p>Connection, inbox logs, and conversations</p>
          </div>
        </Link>
        <Link to="/ai" className="nav-card">
          <div className="nav-icon">🤖</div>
          <div>
            <h3>AI Studio</h3>
            <p>Advanced drafting when the quick actions are not enough</p>
          </div>
        </Link>
      </section>

      {showQuickActionModal && activeTask && (
        <div className="modal-shell" onClick={closeQuickActionModal}>
          <div className="card quick-ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-ai-header">
              <div>
                <h2>Quick action</h2>
                <p>Generate and send the next WhatsApp message without leaving Today Tasks.</p>
              </div>
              <button onClick={closeQuickActionModal} className="btn btn-secondary" disabled={aiLoading || sending}>
                Close
              </button>
            </div>

            <div className="quick-ai-context">
              <div>
                <span>Lead</span>
                <strong>{activeTask.lead.name}</strong>
              </div>
              <div>
                <span>Contact</span>
                <strong>{activeTask.lead.contact || 'No WhatsApp number saved'}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{activeTask.lead.status}</strong>
              </div>
            </div>

            <div className="quick-ai-layout">
              <div className="quick-ai-config">
                <AiComposerFields
                  config={config}
                  onChange={(patch) => setConfig((current) => ({ ...current, ...patch }))}
                  compact
                  advancedOpen={advancedOpen}
                  onToggleAdvanced={() => setAdvancedOpen((value) => !value)}
                />

                <button onClick={handleGenerate} className="btn btn-primary quick-ai-generate" disabled={aiLoading}>
                  {aiLoading ? 'Generating...' : generatedText ? 'Regenerate Variant' : 'Generate Message'}
                </button>
              </div>

              <div className="quick-ai-result">
                <textarea
                  value={generatedText}
                  onChange={(e) => setGeneratedText(e.target.value)}
                  className="input generated-textarea quick-ai-textarea"
                  placeholder="Generated message will appear here..."
                  rows={12}
                />

                <div className="quick-ai-actions">
                  <button
                    onClick={() => navigator.clipboard.writeText(generatedText)}
                    className="btn btn-success"
                    disabled={!generatedText}
                  >
                    Copy Message
                  </button>
                  <button onClick={handleSend} className="btn btn-primary" disabled={!generatedText || sending || !activeTask.lead.contact}>
                    {sending ? 'Sending...' : 'Send on WhatsApp'}
                  </button>
                </div>

                <AiStatusPanel generationStage={generationStage} generationDebug={generationDebug} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
