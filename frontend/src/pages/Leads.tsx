import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lead, LeadStatus, UsageInfo, leadsApi, usageApi } from '../services/api';
import { translate, useLanguage } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import UpgradeModal from '../components/UpgradeModal';
import AppLogo from '../components/AppLogo';
import AiComposerFields from '../components/AiComposerFields';
import AiStatusPanel from '../components/AiStatusPanel';
import AiUsageCard from '../components/AiUsageCard';
import { shouldGateCopyForFree } from '../utils/paywall';
import { trackProductEvent } from '../utils/analytics';
import {
  createInitialAiConfig,
  generateAiMessage,
  GenerationStage,
  getDefaultQuickConfigForLead,
  getEventPurpose,
  SharedAiConfig,
} from '../features/ai/shared';

const Leads = () => {
  const { t, language } = useLanguage();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    notes: '',
    status: 'new' as LeadStatus,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [showAiModal, setShowAiModal] = useState(false);
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [config, setConfig] = useState<SharedAiConfig>(createInitialAiConfig());
  const [generatedText, setGeneratedText] = useState('');
  const [generationStage, setGenerationStage] = useState<GenerationStage>('ready');
  const [generationDebug, setGenerationDebug] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeSource, setUpgradeSource] = useState<'copy_gate' | 'ai_limit' | 'post_success' | 'generic'>('generic');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    loadLeads();
    loadUsageInfo();
  }, []);

  const loadUsageInfo = async () => {
    try {
      const response = await usageApi.getUsage();
      if (response.success && response.data) {
        setUsageInfo(response.data);
      }
    } catch (_err) {
      // Optional surface
    }
  };

  const loadLeads = async () => {
    try {
      setLoading(true);
      const response = await leadsApi.getLeads();
      if (response.success && response.data) {
        setAllLeads(response.data);
        setLeads(response.data);
      } else {
        setError(response.error?.message || t.common.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAndSortedLeads = useMemo(() => {
    let filtered = [...allLeads];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (lead) =>
          lead.name.toLowerCase().includes(term) ||
          lead.contact?.toLowerCase().includes(term) ||
          lead.notes?.toLowerCase().includes(term)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((lead) => lead.status === statusFilter);
    }

    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        default:
          comparison =
            new Date(a.lastActivityAt || a.createdAt).getTime() -
            new Date(b.lastActivityAt || b.createdAt).getTime();
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [allLeads, searchTerm, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    setLeads(filteredAndSortedLeads);
  }, [filteredAndSortedLeads]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingLead) {
        await leadsApi.updateLead(editingLead.id, formData);
      } else {
        const created = await leadsApi.createLead(formData);
        if (created.success && created.data) {
          trackProductEvent('lead_created', { status: created.data.status });
        }
      }
      setShowForm(false);
      setEditingLead(null);
      setFormData({ name: '', contact: '', notes: '', status: 'new' });
      setError('');
      loadLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  };

  const handleEdit = (lead: Lead) => {
    setEditingLead(lead);
    setFormData({
      name: lead.name,
      contact: lead.contact || '',
      notes: lead.notes || '',
      status: lead.status,
    });
    setShowForm(true);
  };

  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    try {
      await leadsApi.updateLeadStatus(leadId, newStatus);
      loadLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSortBy('date');
    setSortOrder('desc');
  };

  const calculateDaysPassed = (lead: Lead): number => {
    const lastActivity = lead.lastActivityAt || lead.createdAt;
    return Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));
  };

  const closeAiModal = () => {
    if (aiLoading) {
      return;
    }
    setShowAiModal(false);
    setCurrentLead(null);
    setConfig(createInitialAiConfig());
    setGeneratedText('');
    setGenerationDebug(null);
    setGenerationStage('ready');
    setAdvancedOpen(false);
  };

  const openAiModalForLead = (lead: Lead) => {
    setCurrentLead(lead);
    setConfig(getDefaultQuickConfigForLead(lead, calculateDaysPassed(lead)));
    setGeneratedText('');
    setGenerationDebug(null);
    setGenerationStage('ready');
    setShowAiModal(true);
    setError('');
    setAdvancedOpen(false);
  };

  const handleGenerate = async () => {
    if (!currentLead) {
      return;
    }
    if (!config.objective.trim()) {
      setError(t.ai.objectiveRequired);
      return;
    }

    setAiLoading(true);
    setError('');
    setGenerationStage('thinking');
    setGeneratedText('');
    setGenerationDebug(null);
    trackProductEvent('ai_generate_clicked', {
      purpose: getEventPurpose(config.purpose),
      leadId: currentLead.id,
    });

    try {
      const response = await generateAiMessage({ config, lead: currentLead, language });
      if (response.success && response.data) {
        setGeneratedText(response.data.text);
        setGenerationDebug(response.data.debug || null);
        setGenerationStage('done');
        trackProductEvent('ai_generate_success', {
          purpose: getEventPurpose(config.purpose),
          leadId: currentLead.id,
        });
        if (response.usage) {
          setUsageInfo(response.usage);
          if (response.usage.aiUsageThisMonth === 1) {
            trackProductEvent('first_value_moment', { source: 'leads_quick_ai' });
          }
        } else {
          await loadUsageInfo();
        }
        return;
      }

      setGenerationStage('ready');
      if (response.error?.code === 'AI_LIMIT_REACHED') {
        trackProductEvent('ai_generate_failed_limit', { purpose: getEventPurpose(config.purpose) });
        setUpgradeSource('ai_limit');
        setShowUpgradeModal(true);
        if (response.usage) {
          setUsageInfo(response.usage);
        }
      }
      setError(response.error?.message || t.ai.failedToGenerate);
    } catch (err: any) {
      setGenerationStage('ready');
      if (err?.response?.data?.error?.code === 'AI_LIMIT_REACHED') {
        trackProductEvent('ai_generate_failed_limit', { purpose: getEventPurpose(config.purpose) });
        setUpgradeSource('ai_limit');
        setShowUpgradeModal(true);
        if (err?.response?.data?.usage) {
          setUsageInfo(err.response.data.usage);
        }
      }
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyText = async () => {
    const shouldGate = shouldGateCopyForFree(usageInfo);
    trackProductEvent('copy_clicked', {
      source: 'leads_modal',
      gated: shouldGate,
    });

    if (shouldGate) {
      setUpgradeSource('copy_gate');
      setShowUpgradeModal(true);
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_err) {
      setError(t.common.error);
    }
  };

  const statusColors: Record<string, string> = {
    new: 'var(--info)',
    contacted: 'var(--primary)',
    interested: 'var(--success)',
    waiting_reply: 'var(--warning)',
    not_interested: 'var(--text-secondary)',
    closed: 'var(--text-tertiary)',
  };

  const statusOptions = [
    { value: 'all', label: t.leads.allStatus },
    { value: 'new', label: t.status.new },
    { value: 'contacted', label: t.status.contacted },
    { value: 'interested', label: t.status.interested },
    { value: 'waiting_reply', label: t.status.waiting_reply },
    { value: 'not_interested', label: t.status.not_interested },
    { value: 'closed', label: t.status.closed },
  ];

  const hasActiveFilters = searchTerm || statusFilter !== 'all';

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t.common.loading}</p>
        </div>
      </div>
    );
  }

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
          <div>
            <AppLogo compact />
            <h1 className="page-title">{t.leads.title}</h1>
          </div>
        </div>
        <div className="header-actions">
          <Link to="/pricing" className="btn btn-secondary">
            {t.pricing.pricing}
          </Link>
          <LanguageToggle />
          <ThemeToggle />
          <button
            onClick={() => {
              setShowForm(true);
              setEditingLead(null);
              setFormData({ name: '', contact: '', notes: '', status: 'new' });
              setError('');
            }}
            className="btn btn-primary"
          >
            + {t.leads.addLead}
          </button>
        </div>
      </header>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="card filters-card">
        <div className="filters-header">
          <h3>{t.leads.filtersAndSearch}</h3>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="btn btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
              {t.leads.clearFilters}
            </button>
          )}
        </div>
        <div className="filters-grid">
          <div className="filter-group">
            <label className="form-label">{t.common.search}</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input"
              placeholder={t.leads.searchPlaceholder}
            />
          </div>
          <div className="filter-group">
            <label className="form-label">{t.leads.status}</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input">
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label className="form-label">{t.leads.sortBy}</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'status')} className="input">
              <option value="date">{t.leads.date}</option>
              <option value="name">{t.leads.name}</option>
              <option value="status">{t.leads.status}</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="form-label">{t.leads.order}</label>
            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')} className="input">
              <option value="desc">{t.leads.descending}</option>
              <option value="asc">{t.leads.ascending}</option>
            </select>
          </div>
        </div>
        {hasActiveFilters && (
          <div className="filter-results">
            {translate(t.leads.showingResults, { count: leads.length, total: allLeads.length })}
          </div>
        )}
      </div>

      {showForm && (
        <div className="card form-card">
          <h2>{editingLead ? t.leads.editLead : t.leads.newLead}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{t.leads.name} *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="input"
                placeholder={t.leads.enterLeadName}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t.leads.contact}</label>
              <input
                type="text"
                value={formData.contact}
                onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                className="input"
                placeholder={t.leads.emailOrPhone}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t.leads.notes}</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="input"
                placeholder={t.leads.additionalNotes}
                rows={4}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t.leads.status}</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as LeadStatus })}
                className="input"
              >
                <option value="new">{t.status.new}</option>
                <option value="contacted">{t.status.contacted}</option>
                <option value="interested">{t.status.interested}</option>
                <option value="waiting_reply">{t.status.waiting_reply}</option>
                <option value="not_interested">{t.status.not_interested}</option>
                <option value="closed">{t.status.closed}</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                {editingLead ? t.common.update : t.common.create}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingLead(null);
                  setFormData({ name: '', contact: '', notes: '', status: 'new' });
                }}
                className="btn btn-secondary"
              >
                {t.common.cancel}
              </button>
            </div>
          </form>
        </div>
      )}

      {leads.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-icon">📋</div>
          <h3>{hasActiveFilters ? t.leads.noLeadsMatch : t.leads.noLeads}</h3>
          <p>{hasActiveFilters ? t.leads.noLeadsMatchMessage : t.leads.noLeadsMessage}</p>
          {hasActiveFilters ? (
            <button onClick={clearFilters} className="btn btn-primary">
              {t.leads.clearFilters}
            </button>
          ) : (
            <button onClick={() => setShowForm(true)} className="btn btn-primary">
              {t.leads.createLead}
            </button>
          )}
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.leads.name}</th>
                <th>{t.leads.contact}</th>
                <th>{t.leads.status}</th>
                <th>{t.leads.lastActivity}</th>
                <th>{t.leads.actions}</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <strong>{lead.name}</strong>
                  </td>
                  <td>{lead.contact || '-'}</td>
                  <td>
                    <select
                      value={lead.status}
                      onChange={(e) => handleStatusChange(lead.id, e.target.value as LeadStatus)}
                      className="status-select"
                      style={{
                        backgroundColor: statusColors[lead.status] || 'transparent',
                        color: 'white',
                        border: 'none',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="new">{t.status.new}</option>
                      <option value="contacted">{t.status.contacted}</option>
                      <option value="interested">{t.status.interested}</option>
                      <option value="waiting_reply">{t.status.waiting_reply}</option>
                      <option value="not_interested">{t.status.not_interested}</option>
                      <option value="closed">{t.status.closed}</option>
                    </select>
                  </td>
                  <td>
                    {lead.lastActivityAt
                      ? new Date(lead.lastActivityAt).toLocaleDateString()
                      : new Date(lead.createdAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {(lead.status === 'waiting_reply' || lead.status === 'closed') && (
                        <button onClick={() => openAiModalForLead(lead)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                          {lead.status === 'closed' ? t.leads.helpCollectPayment : t.leads.helpFollowUp}
                        </button>
                      )}
                      <button onClick={() => handleEdit(lead)} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                        {t.common.edit}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAiModal && currentLead && (
        <div className="modal-shell" onClick={closeAiModal}>
          <div className="card quick-ai-modal" onClick={(e) => e.stopPropagation()}>
            <div className="quick-ai-header">
              <div>
                <h2>{t.leads.quickAiTitle}</h2>
                <p>{t.leads.quickAiSubtitle}</p>
              </div>
              <button onClick={closeAiModal} className="btn btn-secondary" disabled={aiLoading}>
                {t.common.close}
              </button>
            </div>

            <div className="quick-ai-context">
              <div>
                <span>{t.leads.name}</span>
                <strong>{currentLead.name}</strong>
              </div>
              <div>
                <span>{t.leads.contact}</span>
                <strong>{currentLead.contact || '-'}</strong>
              </div>
              <div>
                <span>{t.leads.status}</span>
                <strong>{t.status[currentLead.status]}</strong>
              </div>
            </div>

            <AiUsageCard usageInfo={usageInfo} compact onUpgrade={() => setShowUpgradeModal(true)} />

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
                  {aiLoading ? (
                    <>
                      <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                      <span>{t.ai.generating}</span>
                    </>
                  ) : generatedText ? (
                    <span>{t.ai.regenerateVariant}</span>
                  ) : (
                    <span>{t.ai.generateText}</span>
                  )}
                </button>
              </div>

              <div className="quick-ai-result">
                {generatedText && usageInfo?.plan === 'free' && (
                  <div className="post-success-card post-success-card-compact">
                    <div>{translate(t.pricing.valueMessagesCreated, { count: usageInfo.aiUsageThisMonth })}</div>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setUpgradeSource('post_success');
                        setShowUpgradeModal(true);
                      }}
                    >
                      {t.pricing.upgradePrompt}
                    </button>
                  </div>
                )}

                <textarea
                  value={generatedText}
                  onChange={(e) => setGeneratedText(e.target.value)}
                  className="input generated-textarea quick-ai-textarea"
                  placeholder={t.ai.generatedTextPlaceholder}
                  rows={12}
                />

                <div className="quick-ai-actions">
                  <button onClick={handleCopyText} className="btn btn-success" disabled={!generatedText}>
                    {copied ? `✓ ${t.common.copied}` : `📋 ${t.leads.copyMessage}`}
                  </button>
                </div>

                <AiStatusPanel generationStage={generationStage} generationDebug={generationDebug} />
              </div>
            </div>
          </div>
        </div>
      )}

      <UpgradeModal
        isOpen={showUpgradeModal}
        source={upgradeSource}
        generatedCount={usageInfo?.aiUsageThisMonth || 0}
        onClose={() => setShowUpgradeModal(false)}
        onUpgradeSuccess={() => {
          loadUsageInfo();
        }}
      />
    </div>
  );
};

export default Leads;
