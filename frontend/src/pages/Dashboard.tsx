import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  aiApi,
  dashboardApi,
  DashboardSummary,
  getApiErrorMessage,
  leadsApi,
  Lead,
  remindersApi,
  whatsappApi,
} from '../services/api';
import { useAuth } from '../hooks/useAuth';
import AuthenticatedHeader from '../components/AuthenticatedHeader';
import AiComposerFields from '../components/AiComposerFields';
import AiStatusPanel from '../components/AiStatusPanel';
import {
  createInitialAiConfig,
  generateAiMessage,
  GenerationStage,
  getDefaultConfigFromLeadMemory,
  getDefaultConfigFromUserPreferences,
  getDefaultQuickConfigForLead,
  SharedAiConfig,
  shouldRefreshLeadMemory,
} from '../features/ai/shared';
import { translate, useLanguage } from '../contexts/LanguageContext';

const Dashboard = () => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showQuickActionModal, setShowQuickActionModal] = useState(false);
  const [activeTask, setActiveTask] = useState<DashboardSummary['todayTasks'][number] | null>(null);
  const [config, setConfig] = useState<SharedAiConfig>(createInitialAiConfig());
  const [generatedText, setGeneratedText] = useState('');
  const [refineInstruction, setRefineInstruction] = useState('');
  const [cutoffSummary, setCutoffSummary] = useState('');
  const [generationStage, setGenerationStage] = useState<GenerationStage>('ready');
  const [generationDebug, setGenerationDebug] = useState<any>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [sending, setSending] = useState(false);
  const [creatingSampleLead, setCreatingSampleLead] = useState(false);
  const [memorySummary, setMemorySummary] = useState('');
  const [refreshingMemory, setRefreshingMemory] = useState(false);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const response = await dashboardApi.getSummaryV2();
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
      { label: t.dashboard.todayTasksLabel, value: String(summary?.todayTasks.length || 0), trend: summary?.kpiTrend?.todayTasks || 0 },
      { label: t.dashboard.unreadMessagesLabel, value: String(summary?.unreadMessages || 0), trend: summary?.kpiTrend?.unreadMessages || 0 },
      { label: t.dashboard.overdueFollowUpsLabel, value: String(summary?.overdueFollowUps || 0), trend: summary?.kpiTrend?.overdueFollowUps || 0 },
      {
        label: t.dashboard.waitingPaymentLabel,
        value: summary?.waitingPaymentAmount ? `RM ${summary.waitingPaymentAmount}` : String(summary?.waitingPayment || 0),
        trend: summary?.kpiTrend?.payments || 0,
      },
      { label: t.dashboard.recentlyRepliedLabel, value: String(summary?.recentlyReplied.length || 0), trend: 0 },
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

  const hydrateLeadMemory = async (lead: Lead) => {
    setMemorySummary(lead.memorySummary || '');
    if (!shouldRefreshLeadMemory(lead, language)) {
      return lead;
    }

    try {
      setRefreshingMemory(true);
      const response = await leadsApi.refreshMemory(lead.id, language);
      if (response.success && response.data) {
        const refreshedLead = response.data.lead;
        setMemorySummary(response.data.memory.summary || refreshedLead.memorySummary || '');
        setConfig((current) => ({
          ...current,
          ...getDefaultConfigFromUserPreferences(user, current),
          ...getDefaultConfigFromLeadMemory(refreshedLead, current),
        }));
        return refreshedLead;
      }
    } catch (err) {
      setError(getApiErrorMessage(err, t.common.error));
    } finally {
      setRefreshingMemory(false);
    }

    return lead;
  };

  const openQuickAction = async (task: DashboardSummary['todayTasks'][number], action: string) => {
    const lead: Lead = {
      id: task.lead.id,
      userId: user?.id || '',
      name: task.lead.name,
      contact: task.lead.contact || undefined,
      notes: '',
      status: task.lead.status,
      stage: 'inquiry',
      tags: ['inquiry'],
      memorySummary: null,
      memoryGoal: null,
      aiTonePreference: null,
      aiConversationMode: null,
      aiEmojiDensity: null,
      aiOutputFormat: null,
      memoryUpdatedAt: null,
      lastActivityAt: task.lead.lastOutboundAt || task.lead.lastInboundAt || task.triggerAt,
      lastInboundAt: task.lead.lastInboundAt || undefined,
      lastOutboundAt: task.lead.lastOutboundAt || undefined,
      nextFollowUpAt: task.lead.nextFollowUpAt || undefined,
      closedReason: null,
      createdAt: task.triggerAt,
    };

    const refreshedLead = await hydrateLeadMemory(lead);
    const baseConfig = getDefaultQuickConfigForLead(refreshedLead, 0);
    const objectiveByAction: Record<string, Partial<SharedAiConfig>> = {
      send_follow_up: {
        goal: refreshedLead.memoryGoal || 'Send a concise follow-up and ask for a clear next step.',
      },
      ask_budget: {
        goal: 'Ask for budget, package fit, and next-step timing.',
      },
      payment_reminder: {
        goal: 'Follow up on payment and ask for a clear payment date.',
      },
    };

    setActiveTask(task);
    setConfig({
      ...getDefaultConfigFromUserPreferences(user, baseConfig),
      ...baseConfig,
      channel: 'whatsapp',
      ...(objectiveByAction[action] || objectiveByAction.send_follow_up),
    });
    setGeneratedText('');
    setRefineInstruction('');
    setCutoffSummary('');
    setMemorySummary(refreshedLead.memorySummary || '');
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
    setRefineInstruction('');
    setCutoffSummary('');
    setMemorySummary('');
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
    setRefineInstruction('');
    setCutoffSummary('');
    setGenerationDebug(null);
    setError('');

    try {
      const response = await generateAiMessage({ config, lead, language });
      if (response.success && response.data) {
        const data = response.data;
        setGeneratedText(data.text);
        setCutoffSummary(data.cutoffSummary || '');
        setMemorySummary(data.memorySummary || memorySummary);
        if (data.memoryGoal) {
          setConfig((current) => ({ ...current, goal: data.memoryGoal || current.goal }));
        }
        setGenerationDebug(data.debug || null);
        setGenerationStage('done');
        return;
      }

      setGenerationStage('ready');
      setError(response.error?.message || t.dashboard.generateFailed);
    } catch (err) {
      setGenerationStage('ready');
      setError(getApiErrorMessage(err, t.dashboard.generateFailed));
    } finally {
      setAiLoading(false);
    }
  };

  const handleRefine = async () => {
    if (!activeTask || !generatedText.trim() || !refineInstruction.trim()) {
      return;
    }

    setRefining(true);
    setGenerationStage('thinking');
    setError('');
    try {
      const response = await aiApi.refineMessage({
        leadId: activeTask.lead.id,
        originalText: generatedText.trim(),
        instruction: refineInstruction.trim(),
        style: config.style,
        channel: config.channel,
        emojiIntensity: config.emojiIntensity,
        language,
        purpose: activeTask.lead.status === 'won' ? 'payment' : 'follow_up',
      });
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
      setError(getApiErrorMessage(err, t.dashboard.generateFailed));
    } finally {
      setRefining(false);
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
      setError(getApiErrorMessage(err, t.dashboard.sendFailed));
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

    await openQuickAction(task, action);
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

  const unreadItems = summary?.latestUnread || [];
  const todayTasks = summary?.todayTasks || [];
  const recentReplies = summary?.recentlyReplied || [];
  const hasPanelError = !loading && !!error;
  const unreadCount = summary?.unreadMessages || 0;
  const overdueCount = summary?.overdueFollowUps || 0;
  const hasConnectedWhatsApp = summary?.onboarding.hasConnectedWhatsApp || false;
  const hasLeads = summary?.onboarding.hasLeads || false;
  const hasUrgentAttention = unreadCount > 0 || overdueCount > 0;

  const sortedUnreadItems = useMemo(
    () =>
      [...unreadItems].sort((a, b) => {
        if (b.unreadCount !== a.unreadCount) {
          return b.unreadCount - a.unreadCount;
        }
        return new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
      }),
    [unreadItems]
  );

  const sortedTodayTasks = useMemo(
    () =>
      [...todayTasks].sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) {
          return a.isOverdue ? -1 : 1;
        }
        return new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime();
      }),
    [todayTasks]
  );

  const getTaskActionPriority = (task: DashboardSummary['todayTasks'][number], action: string) => {
    if (task.type === 'payment') {
      const paymentPriority: Record<string, number> = {
        payment_reminder: 0,
        send_follow_up: 1,
        ask_budget: 2,
        mark_won: 3,
        snooze: 4,
      };
      return paymentPriority[action] ?? 99;
    }

    const followUpPriority: Record<string, number> = {
      send_follow_up: task.isOverdue ? 0 : 1,
      ask_budget: 2,
      payment_reminder: 3,
      mark_won: 4,
      snooze: task.isOverdue ? 5 : 0,
    };
    return followUpPriority[action] ?? 99;
  };

  const nextActions = useMemo(() => {
    if (!summary) return [];

    const items: Array<{
      id: string;
      title: string;
      body: string;
      to?: string;
      kind: 'info' | 'warning' | 'success' | 'danger';
      ctaLabel?: string;
      priority: number;
      action?: 'sample-lead';
    }> = [];

    if (!summary.onboarding.hasConnectedWhatsApp) {
      items.push({
        id: 'connect-whatsapp',
        title: t.dashboard.taskConnectWhatsappTitle,
        body: t.dashboard.connectWhatsappBody,
        to: '/whatsapp?view=setup&source=dashboard',
        kind: 'warning',
        ctaLabel: t.dashboard.ctaOpenWhatsappSetup,
        priority: 130,
      });
    }

    if (summary.unreadMessages > 0) {
      items.push({
        id: 'inbox',
        title: translate(t.dashboard.taskUnreadTitle, { count: summary.unreadMessages }),
        body: t.dashboard.unreadBannerBody,
        to: '/whatsapp?view=inbox&source=dashboard',
        kind: 'danger',
        ctaLabel: t.dashboard.ctaReviewUnreadNow,
        priority: 120,
      });
    }

    if (summary.overdueFollowUps > 0) {
      items.push({
        id: 'overdue',
        title: translate(t.dashboard.taskOverdueTitle, { count: summary.overdueFollowUps }),
        body: translate(t.dashboard.overdueActionBody, { count: summary.overdueFollowUps }),
        to: '/reminders?source=dashboard',
        kind: 'warning',
        ctaLabel: t.dashboard.ctaResolveOverdueNow,
        priority: 110,
      });
    }

    if (summary.todayTasks.length > 0) {
      items.push({
        id: 'reminders',
        title: t.dashboard.taskTodayQueueTitle,
        body: t.dashboard.tasksActionBody,
        to: '/reminders?source=dashboard',
        kind: 'info',
        ctaLabel: t.dashboard.ctaReviewTasksNow,
        priority: 90,
      });
    }

    if (!summary.onboarding.hasLeads) {
      items.push({
        id: 'sample',
        title: t.dashboard.taskAddLeadTitle,
        body: t.dashboard.sampleLeadNotes,
        kind: 'warning',
        priority: 80,
        action: 'sample-lead',
      });
    }

    items.push({
      id: 'whatsapp',
      title: t.dashboard.taskReviewConversationsTitle,
      body: t.dashboard.whatsappNavBody,
      to: '/whatsapp?source=dashboard',
      kind: 'success',
      ctaLabel: t.dashboard.ctaOpenWhatsappInbox,
      priority: 30,
    });

    return items.sort((a, b) => b.priority - a.priority);
  }, [summary, t]);

  const priorityLabelByKind: Record<'info' | 'warning' | 'success' | 'danger', string> = {
    danger: t.dashboard.priorityNow,
    warning: t.dashboard.priorityNext,
    info: t.dashboard.priorityLater,
    success: t.dashboard.prioritySetup,
  };

  const topbarPrimaryAction = nextActions.find((item) => item.to);
  const topbarSecondaryAction = nextActions.find((item) => item.to && item.id !== topbarPrimaryAction?.id);
  const primaryActionId = topbarPrimaryAction?.id || '';
  const taskPanelIsPrimary = primaryActionId === 'overdue' || primaryActionId === 'reminders';

  return (
    <div className="page-container">
      <AuthenticatedHeader
        title={t.dashboard.todayTasksTitle}
        subtitle={translate(t.dashboard.signedInAs, { email: user?.email || 'user' })}
        whatsappUnreadCount={summary?.unreadConversations || 0}
      />

      {error && <div className="alert alert-error">{error}</div>}

      <section className={`card dashboard-topbar ${hasUrgentAttention ? 'dashboard-topbar-locked' : ''}`}>
        <div>
          <p className="eyebrow">{t.dashboard.heroEyebrow}</p>
          <h2>{topbarPrimaryAction?.title || t.dashboard.todayTasksSubtitle}</h2>
          <p className="page-subtitle">{topbarPrimaryAction?.body || t.dashboard.heroFollowUpBody}</p>
        </div>
        <div className="dashboard-topbar-actions">
          {topbarPrimaryAction?.to ? (
            <Link to={topbarPrimaryAction.to} className="btn btn-primary dashboard-primary-lock">
              {topbarPrimaryAction.ctaLabel || t.dashboard.openCta}
            </Link>
          ) : null}
          {topbarSecondaryAction?.to ? (
            <Link to={topbarSecondaryAction.to} className="btn btn-secondary dashboard-secondary-cta">
              {topbarSecondaryAction.ctaLabel || t.dashboard.openCta}
            </Link>
          ) : (
            <Link to="/reminders?source=dashboard" className="btn btn-secondary dashboard-secondary-cta">
              {t.reminders.title}
            </Link>
          )}
        </div>
      </section>

      <section className="today-stats-grid dashboard-kpi-grid">
        {stats.map((card) => (
          <article key={card.label} className="card stat-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            {card.trend ? (
              <small className={card.trend > 0 ? 'dashboard-trend-up' : 'dashboard-trend-down'}>
                {card.trend > 0 ? '+' : ''}
                {card.trend} / 7d
              </small>
            ) : (
              <small className="dashboard-trend-neutral">—</small>
            )}
          </article>
        ))}
      </section>

      <section className={`card dashboard-panel ${hasUrgentAttention && primaryActionId !== 'inbox' ? 'dashboard-panel-muted' : ''}`}>
        <div className="section-heading dashboard-panel-heading">
          <h3>{t.dashboard.unreadSectionTitle}</h3>
          <div className="dashboard-panel-actions">
            <span className="status-chip status-chip-info">
              {translate(t.dashboard.unreadBannerTitle, { count: summary?.unreadMessages || 0 })}
            </span>
              <Link to="/whatsapp?view=inbox&source=dashboard" className="btn btn-secondary dashboard-secondary-cta">
                {t.dashboard.openUnreadConversation}
              </Link>
          </div>
        </div>
        <p className="page-subtitle">{t.dashboard.unreadSectionSubtitle}</p>

        {loading ? (
          <div className="dashboard-panel-state">
            <div className="spinner" aria-hidden="true" />
            <p>{t.common.loading}</p>
          </div>
        ) : hasPanelError ? (
          <div className="dashboard-panel-state dashboard-panel-state-error">
            <p>{error || t.common.error}</p>
            <button className="btn btn-secondary" onClick={loadSummary}>{t.reminders.refresh}</button>
          </div>
        ) : sortedUnreadItems.length === 0 ? (
          <div className="dashboard-panel-state">
            <p>
              {!hasConnectedWhatsApp
                ? t.dashboard.noUnreadNoConnection
                : !hasLeads
                  ? t.dashboard.noUnreadNoLeads
                  : t.dashboard.noUnreadClear}
            </p>
            {!hasConnectedWhatsApp ? (
              <Link to="/whatsapp?view=setup&source=dashboard" className="btn btn-secondary">{t.dashboard.ctaOpenWhatsappSetup}</Link>
            ) : !hasLeads ? (
              <Link to="/leads" className="btn btn-secondary">{t.dashboard.ctaAddFirstLead}</Link>
            ) : (
              <Link to="/whatsapp?view=inbox&source=dashboard" className="btn btn-secondary">{t.dashboard.ctaOpenWhatsappInbox}</Link>
            )}
          </div>
        ) : (
          <div className="simple-list">
            {sortedUnreadItems.map((item, index) => (
              <div key={item.phone} className="simple-list-item dashboard-list-item">
                <div className="dashboard-list-copy">
                  <strong>{translate(t.dashboard.taskReplyLeadTitle, { name: item.lead?.name || item.phone })}</strong>
                  <p>{item.lastMessagePreview || t.dashboard.unreadPreviewFallback}</p>
                </div>
                <div className="dashboard-list-actions">
                  <span className="status-chip status-chip-danger">{item.unreadCount}</span>
                  <Link
                    to={`/whatsapp?view=inbox&source=dashboard&phone=${encodeURIComponent(item.phone)}`}
                    className={`btn ${index === 0 ? 'btn-primary' : 'btn-secondary dashboard-secondary-cta'}`}
                  >
                    {index === 0 ? t.dashboard.ctaReviewUnreadNow : t.dashboard.openUnreadConversation}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`card dashboard-panel ${hasUrgentAttention && !taskPanelIsPrimary ? 'dashboard-panel-muted' : ''}`}>
        <div className="section-heading dashboard-panel-heading">
          <h3>{t.dashboard.todayTasksTitle}</h3>
          <div className="dashboard-panel-actions">
            <span className="status-chip status-chip-danger">
              {t.dashboard.overdueFollowUpsLabel}: {summary?.overdueFollowUps || 0}
            </span>
            <span className="status-chip status-chip-info">
              {t.dashboard.waitingPaymentLabel}: {summary?.waitingPaymentAmount ? `RM ${summary.waitingPaymentAmount}` : summary?.waitingPayment || 0}
            </span>
            <Link to="/reminders?source=dashboard" className="btn btn-secondary dashboard-secondary-cta">{t.reminders.title}</Link>
          </div>
        </div>

        {loading ? (
          <div className="dashboard-panel-state">
            <div className="spinner" aria-hidden="true" />
            <p>{t.dashboard.loadingTasks}</p>
          </div>
        ) : hasPanelError ? (
          <div className="dashboard-panel-state dashboard-panel-state-error">
            <p>{error || t.dashboard.loadFailed}</p>
            <button className="btn btn-secondary" onClick={loadSummary}>{t.reminders.refresh}</button>
          </div>
        ) : sortedTodayTasks.length === 0 ? (
          <div className="dashboard-panel-state">
            <p>
              {unreadCount > 0
                ? t.dashboard.noTasksButUnread
                : !hasLeads
                  ? t.dashboard.noTasksNoLeads
                  : t.dashboard.noTasksDue}
            </p>
            {unreadCount > 0 ? (
              <Link to="/whatsapp?view=inbox&source=dashboard" className="btn btn-secondary">{t.dashboard.ctaReviewUnreadNow}</Link>
            ) : !hasLeads ? (
              <Link to="/leads" className="btn btn-secondary">{t.dashboard.ctaAddFirstLead}</Link>
            ) : (
              <Link to="/reminders?source=dashboard" className="btn btn-secondary">{t.reminders.createReminder}</Link>
            )}
          </div>
        ) : (
          <div className="today-task-list">
            {sortedTodayTasks.map((task) => {
              const prioritizedActions = [...task.suggestedActions].sort(
                (a, b) => getTaskActionPriority(task, a) - getTaskActionPriority(task, b)
              );

              return (
                <div key={task.id} className="today-task-card">
                  <div className="today-task-top">
                    <div>
                      <strong>{translate(t.dashboard.taskFollowUpLeadTitle, { name: task.lead.name })}</strong>
                      <p>{task.lead.contact || t.dashboard.noWhatsappSaved}</p>
                    </div>
                    <span className={`status-chip ${task.isOverdue ? 'status-chip-danger' : 'status-chip-warning'}`}>
                      {task.isOverdue ? t.dashboard.overduePill : new Date(task.triggerAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="today-task-meta">
                    {task.type === 'payment' ? t.dashboard.paymentFollowUpMeta : t.dashboard.customerFollowUpMeta} • {t.status[task.lead.status as keyof typeof t.status] || task.lead.status}
                  </p>
                  <div className="today-task-actions">
                    {prioritizedActions.slice(0, 1).map((action) => (
                      <button
                        key={action}
                        className="btn btn-primary"
                        onClick={() => handleTaskAction(task, action)}
                      >
                        {`${t.dashboard.recommendedAction}: ${actionLabels[action] || action}`}
                      </button>
                    ))}
                  </div>
                  {prioritizedActions.length > 1 ? <p className="today-task-secondary-hint">{t.dashboard.secondaryActionsHint}</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="today-dashboard-grid dashboard-action-grid">
        <article className={`card dashboard-panel ${hasUrgentAttention ? 'dashboard-panel-muted' : ''}`}>
          <div className="section-heading dashboard-panel-heading">
            <h3>{t.dashboard.todayFollowUpsTitle}</h3>
            <Link to="/reminders?source=dashboard" className="btn btn-secondary dashboard-secondary-cta">{t.reminders.title}</Link>
          </div>
          {loading ? (
            <div className="dashboard-panel-state"><div className="spinner" aria-hidden="true" /><p>{t.common.loading}</p></div>
          ) : hasPanelError ? (
            <div className="dashboard-panel-state dashboard-panel-state-error"><p>{error || t.common.error}</p></div>
          ) : recentReplies.length === 0 ? (
            <div className="dashboard-panel-state">
              <p>{t.dashboard.noRecentRepliesActionBody}</p>
              <Link to="/whatsapp?view=inbox&source=dashboard" className="btn btn-secondary dashboard-secondary-cta">{t.dashboard.ctaOpenWhatsappInbox}</Link>
            </div>
          ) : (
            <div className="simple-list">
              {recentReplies.map((lead) => (
                <div key={lead.id} className="simple-list-item dashboard-list-item">
                  <div className="dashboard-list-copy">
                    <strong>{lead.name}</strong>
                    <p>{lead.contact || t.dashboard.noContact}</p>
                  </div>
                  <span className="status-chip status-chip-success">
                    {lead.lastInboundAt ? new Date(lead.lastInboundAt).toLocaleString() : t.dashboard.justNow}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className={`card dashboard-panel ${hasUrgentAttention ? 'dashboard-panel-muted' : ''}`}>
          <div className="section-heading dashboard-panel-heading">
            <h3>{t.dashboard.quickActionTitle}</h3>
            <Link to="/whatsapp?view=inbox&source=dashboard" className="btn btn-secondary dashboard-secondary-cta">{t.dashboard.openWhatsappCta}</Link>
          </div>
          {loading ? (
            <div className="dashboard-panel-state"><div className="spinner" aria-hidden="true" /><p>{t.common.loading}</p></div>
          ) : hasPanelError ? (
            <div className="dashboard-panel-state dashboard-panel-state-error"><p>{error || t.common.error}</p></div>
          ) : nextActions.length === 0 ? (
            <div className="dashboard-panel-state"><p>{t.dashboard.noTasksDue}</p></div>
          ) : (
            <div className="simple-list">
              {nextActions.map((item, index) => (
                <div key={item.id} className="simple-list-item dashboard-list-item">
                  <div className="dashboard-list-copy">
                    <strong>{translate(t.dashboard.stepTaskTitle, { step: index + 1, title: item.title })}</strong>
                    <p>{item.body}</p>
                  </div>
                  <div className="dashboard-list-actions">
                    <span
                      className={`status-chip ${
                        item.kind === 'danger'
                          ? 'status-chip-danger'
                          : item.kind === 'success'
                            ? 'status-chip-success'
                            : item.kind === 'warning'
                              ? 'status-chip-warning'
                              : 'status-chip-info'
                      }`}
                    >
                      {priorityLabelByKind[item.kind]}
                    </span>
                    {item.action === 'sample-lead' ? (
                      <button
                        onClick={handleCreateSampleLead}
                        className={`btn ${index === 0 ? 'btn-primary' : 'btn-secondary dashboard-secondary-cta'}`}
                        disabled={creatingSampleLead}
                      >
                        {creatingSampleLead ? t.dashboard.creatingSampleLead : t.dashboard.addSampleLead}
                      </button>
                    ) : item.to ? (
                      <Link to={item.to} className={`btn ${index === 0 ? 'btn-primary' : 'btn-secondary dashboard-secondary-cta'}`}>
                        {item.ctaLabel || t.dashboard.openCta}
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
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
                  {aiLoading ? t.ai.generating : generatedText ? t.ai.regenerate : t.dashboard.generateMessage}
                </button>
              </div>

              <div className="quick-ai-result">
                {(memorySummary || refreshingMemory || config.goal) && (
                  <div className="ai-cutoff-card ai-cutoff-card-compact">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                      <strong>{t.ai.memoryPoint}</strong>
                      {activeTask ? (
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() =>
                            hydrateLeadMemory({
                              id: activeTask.lead.id,
                              userId: user?.id || '',
                              name: activeTask.lead.name,
                              contact: activeTask.lead.contact || undefined,
                              notes: '',
                              status: activeTask.lead.status,
                              memorySummary: null,
                              memoryGoal: null,
                              aiTonePreference: null,
                              aiConversationMode: null,
                              aiEmojiDensity: null,
                              aiOutputFormat: null,
                              memoryUpdatedAt: null,
                              lastActivityAt: activeTask.lead.lastOutboundAt || activeTask.lead.lastInboundAt || activeTask.triggerAt,
                              lastInboundAt: activeTask.lead.lastInboundAt || undefined,
                              lastOutboundAt: activeTask.lead.lastOutboundAt || undefined,
                              nextFollowUpAt: activeTask.lead.nextFollowUpAt || undefined,
                              closedReason: null,
                              createdAt: activeTask.triggerAt,
                            })
                          }
                          disabled={refreshingMemory}
                        >
                          {refreshingMemory ? t.ai.refreshingMemory : t.ai.refreshMemory}
                        </button>
                      ) : null}
                    </div>
                    {memorySummary ? <p>{memorySummary}</p> : null}
                    {config.goal ? <p><strong>{t.ai.memoryGoal}:</strong> {config.goal}</p> : null}
                  </div>
                )}

                {cutoffSummary && (
                  <div className="ai-cutoff-card ai-cutoff-card-compact">
                    <strong>{t.ai.conversationCutoff}</strong>
                    <p>{cutoffSummary}</p>
                  </div>
                )}

                <textarea
                  value={generatedText}
                  onChange={(e) => setGeneratedText(e.target.value)}
                  className="input generated-textarea quick-ai-textarea"
                  placeholder={t.ai.generatedTextPlaceholder}
                  rows={12}
                />

                <div className="form-group" style={{ marginTop: '12px' }}>
                  <label className="form-label">{t.ai.refinementInstruction}</label>
                  <input
                    className="input"
                    value={refineInstruction}
                    onChange={(e) => setRefineInstruction(e.target.value)}
                    placeholder={t.ai.refinementPlaceholder}
                  />
                </div>

                <div className="quick-ai-actions">
                  <button onClick={handleGenerate} className="btn btn-secondary" disabled={aiLoading}>
                    {t.ai.regenerate}
                  </button>
                  <button onClick={handleRefine} className="btn btn-primary" disabled={!generatedText || refining || !refineInstruction.trim()}>
                    {refining ? t.ai.refining : t.ai.refine}
                  </button>
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
