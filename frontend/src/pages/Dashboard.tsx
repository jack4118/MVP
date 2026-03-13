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
import { translate, useLanguage } from '../contexts/LanguageContext';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const { language, t } = useLanguage();
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
  const [creatingSampleLead, setCreatingSampleLead] = useState(false);

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
        setError(response.error?.message || t.dashboard.loadFailed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.dashboard.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(
    () => [
      { label: t.dashboard.todayTasksLabel, value: String(summary?.todayTasks.length || 0) },
      { label: t.dashboard.overdueFollowUpsLabel, value: String(summary?.overdueFollowUps || 0) },
      { label: t.dashboard.waitingPaymentLabel, value: String(summary?.waitingPayment || 0) },
      { label: t.dashboard.recentlyRepliedLabel, value: String(summary?.recentlyReplied.length || 0) },
    ],
    [summary, t]
  );

  const onboardingSteps = useMemo(
    () => [
      {
        id: 'whatsapp',
        label: t.dashboard.onboardingConnectLabel,
        done: !!summary?.onboarding.hasConnectedWhatsApp,
        hint: summary?.onboarding.connectedDisplayPhone
          ? translate(t.dashboard.onboardingConnectedHint, { phone: summary.onboarding.connectedDisplayPhone })
          : t.dashboard.onboardingConnectHint,
        cta: '/whatsapp',
      },
      {
        id: 'lead',
        label: t.dashboard.onboardingLeadLabel,
        done: !!summary?.onboarding.hasLeads,
        hint: summary?.onboarding.hasLeads
          ? translate(t.dashboard.onboardingLeadDoneHint, { count: summary.onboarding.totalLeads })
          : t.dashboard.onboardingLeadHint,
        cta: '/leads',
      },
      {
        id: 'send',
        label: t.dashboard.onboardingSendLabel,
        done: !!summary?.onboarding.hasSentFollowUp,
        hint: summary?.onboarding.hasSentFollowUp
          ? translate(t.dashboard.onboardingSendDoneHint, { count: summary.onboarding.sentMessagesCount })
          : t.dashboard.onboardingSendHint,
        cta: '/leads',
      },
    ],
    [summary, t]
  );

  const actionLabels: Record<string, string> = {
    send_follow_up: t.dashboard.actionSendFollowUp,
    ask_budget: t.dashboard.actionAskBudget,
    payment_reminder: t.dashboard.actionPaymentReminder,
    mark_won: t.dashboard.actionMarkWon,
    snooze: t.dashboard.actionSnooze,
  };

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
      setError(response.error?.message || t.dashboard.generateFailed);
    } catch (err) {
      setGenerationStage('ready');
      setError(err instanceof Error ? err.message : t.dashboard.generateFailed);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSend = async () => {
    if (!activeTask?.lead.contact || !generatedText.trim()) {
      setError(t.dashboard.sendValidationError);
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
      setError(err instanceof Error ? err.message : t.dashboard.sendFailed);
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

  const handleCreateSampleLead = async () => {
    try {
      setCreatingSampleLead(true);
      setError('');
      const response = await leadsApi.createLead({
        name: t.dashboard.sampleLeadName,
        notes: t.dashboard.sampleLeadNotes,
        status: 'new',
      });

      if (!response.success) {
        setError(response.error?.message || t.dashboard.sampleLeadFailed);
        return;
      }

      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.dashboard.sampleLeadFailed);
    } finally {
      setCreatingSampleLead(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <AppLogo />
          <h1 className="page-title">{t.dashboard.todayTasksTitle}</h1>
          <p className="page-subtitle">{t.dashboard.todayTasksSubtitle}</p>
          <p className="page-subtitle">{translate(t.dashboard.signedInAs, { email: user?.email || 'user' })}</p>
        </div>
        <div className="header-actions">
          <Link to="/pricing" className="btn btn-secondary">
            {t.pricing.pricing}
          </Link>
          <LanguageToggle />
          <ThemeToggle />
          <button onClick={logout} className="btn btn-danger">
            {t.auth.logout}
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
        <p className="eyebrow">{t.dashboard.heroEyebrow}</p>
        <h2>{t.dashboard.heroFollowUpTitle}</h2>
        <p>{t.dashboard.heroFollowUpBody}</p>
      </section>

      <section className="card">
        <div className="section-heading">
          <h3>{t.dashboard.onboardingTitle}</h3>
          <span>{translate(t.dashboard.onboardingProgress, { count: onboardingSteps.filter((step) => step.done).length, total: 3 })}</span>
        </div>
        <div className="simple-list">
          {onboardingSteps.map((step) => (
            <div key={step.id} className="simple-list-item">
              <div>
                <strong>{step.done ? '✓' : '○'} {step.label}</strong>
                <p>{step.hint}</p>
              </div>
              {!step.done && step.id === 'lead' ? (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button onClick={handleCreateSampleLead} className="btn btn-primary" disabled={creatingSampleLead}>
                    {creatingSampleLead ? t.dashboard.creatingSampleLead : t.dashboard.addSampleLead}
                  </button>
                  <Link to={step.cta} className="btn btn-secondary">
                    {t.dashboard.openCta}
                  </Link>
                </div>
              ) : !step.done ? (
                <Link to={step.cta} className="btn btn-secondary">
                  {t.dashboard.openCta}
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="today-dashboard-grid">
        <article className="card">
          <div className="section-heading">
            <h3>{t.dashboard.todayFollowUpsTitle}</h3>
            <button className="btn btn-secondary" onClick={loadSummary}>
              {t.reminders.refresh}
            </button>
          </div>
          {loading ? (
            <p>{t.dashboard.loadingTasks}</p>
          ) : summary?.todayTasks.length ? (
            <div className="today-task-list">
              {summary.todayTasks.map((task) => (
                <div key={task.id} className="today-task-card">
                  <div className="today-task-top">
                    <div>
                      <strong>{task.lead.name}</strong>
                      <p>{task.lead.contact || t.dashboard.noWhatsappSaved}</p>
                    </div>
                    <span className={`task-pill ${task.isOverdue ? 'task-pill-overdue' : ''}`}>
                      {task.isOverdue ? t.dashboard.overduePill : new Date(task.triggerAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="today-task-meta">
                    {task.type === 'payment' ? t.dashboard.paymentFollowUpMeta : t.dashboard.customerFollowUpMeta} • {t.status[task.lead.status as keyof typeof t.status] || task.lead.status}
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
            <p>{t.dashboard.noTasksDue}</p>
          )}
        </article>

        <article className="card">
          <div className="section-heading">
            <h3>{t.dashboard.recentlyRepliedTitle}</h3>
            <Link to="/whatsapp" className="btn btn-secondary">
              {t.dashboard.openWhatsappCta}
            </Link>
          </div>
          {summary?.recentlyReplied.length ? (
            <div className="simple-list">
              {summary.recentlyReplied.map((lead) => (
                <div key={lead.id} className="simple-list-item">
                  <div>
                    <strong>{lead.name}</strong>
                    <p>{lead.contact || t.dashboard.noContact}</p>
                  </div>
                  <span>{lead.lastInboundAt ? new Date(lead.lastInboundAt).toLocaleString() : t.dashboard.justNow}</span>
                </div>
              ))}
            </div>
          ) : (
            <p>{t.dashboard.noRecentReplies}</p>
          )}
        </article>
      </section>

      <section className="dashboard-nav">
        <Link to="/leads" className="nav-card">
          <div className="nav-icon">👥</div>
          <div>
            <h3>{t.dashboard.leadsNavTitle}</h3>
            <p>{t.dashboard.leadsNavBody}</p>
          </div>
        </Link>
        <Link to="/whatsapp" className="nav-card">
          <div className="nav-icon">💬</div>
          <div>
            <h3>{t.dashboard.whatsappNavTitle}</h3>
            <p>{t.dashboard.whatsappNavBody}</p>
          </div>
        </Link>
        <Link to="/ai" className="nav-card">
          <div className="nav-icon">🤖</div>
          <div>
            <h3>{t.dashboard.aiStudioNavTitle}</h3>
            <p>{t.dashboard.aiStudioNavBody}</p>
          </div>
        </Link>
      </section>

      {showQuickActionModal && activeTask && (
        <div className="modal-shell" onClick={closeQuickActionModal}>
          <div className="card quick-ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-ai-header">
              <div>
                <h2>{t.dashboard.quickActionTitle}</h2>
                <p>{t.dashboard.quickActionSubtitle}</p>
              </div>
              <button onClick={closeQuickActionModal} className="btn btn-secondary" disabled={aiLoading || sending}>
                {t.common.close}
              </button>
            </div>

            <div className="quick-ai-context">
              <div>
                <span>{t.leads.title}</span>
                <strong>{activeTask.lead.name}</strong>
              </div>
              <div>
                <span>{t.leads.contact}</span>
                <strong>{activeTask.lead.contact || t.dashboard.noWhatsappSaved}</strong>
              </div>
              <div>
                <span>{t.leads.status}</span>
                <strong>{t.status[activeTask.lead.status as keyof typeof t.status] || activeTask.lead.status}</strong>
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
                  {aiLoading ? t.ai.generating : generatedText ? t.ai.regenerateVariant : t.dashboard.generateMessage}
                </button>
              </div>

              <div className="quick-ai-result">
                <textarea
                  value={generatedText}
                  onChange={(e) => setGeneratedText(e.target.value)}
                  className="input generated-textarea quick-ai-textarea"
                  placeholder={t.ai.generatedTextPlaceholder}
                  rows={12}
                />

                <div className="quick-ai-actions">
                  <button
                    onClick={() => navigator.clipboard.writeText(generatedText)}
                    className="btn btn-success"
                    disabled={!generatedText}
                  >
                    {t.leads.copyMessage}
                  </button>
                  <button onClick={handleSend} className="btn btn-primary" disabled={!generatedText || sending || !activeTask.lead.contact}>
                    {sending ? t.dashboard.sending : t.dashboard.sendOnWhatsapp}
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
