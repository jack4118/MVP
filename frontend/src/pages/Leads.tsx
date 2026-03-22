import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage, Lead, LeadStatus, UsageInfo, leadsApi, usageApi, whatsappApi } from '../services/api';
import { translate, useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../hooks/useAuth';
import UpgradeModal from '../components/UpgradeModal';
import AuthenticatedHeader from '../components/AuthenticatedHeader';
import AiComposerFields from '../components/AiComposerFields';
import AiStatusPanel from '../components/AiStatusPanel';
import AiUsageCard from '../components/AiUsageCard';
import { shouldGateCopyForFree } from '../utils/paywall';
import { trackProductEvent } from '../utils/analytics';
import {
  createInitialAiConfig,
  generateAiMessage,
  GenerationStage,
  getDefaultConfigFromLeadMemory,
  getDefaultConfigFromUserPreferences,
  getDefaultQuickConfigForLead,
  getEventPurpose,
  SharedAiConfig,
  shouldRefreshLeadMemory,
} from '../features/ai/shared';

const Leads = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
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
  const [generatedVariants, setGeneratedVariants] = useState<string[]>([]);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [cutoffSummary, setCutoffSummary] = useState('');
  const [generationStage, setGenerationStage] = useState<GenerationStage>('ready');
  const [generationDebug, setGenerationDebug] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendingViaWhatsapp, setSendingViaWhatsapp] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeSource, setUpgradeSource] = useState<'copy_gate' | 'ai_limit' | 'post_success' | 'generic'>('generic');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importSummary, setImportSummary] = useState<null | { importedCount: number; skippedCount: number; totalRows: number }>(null);
  const [memorySummary, setMemorySummary] = useState('');
  const [refreshingMemory, setRefreshingMemory] = useState(false);
  const returnTo = searchParams.get('return');

  useEffect(() => {
    loadLeads();
    loadUsageInfo();
  }, []);

  useEffect(() => {
    const leadId = searchParams.get('lead');
    const action = searchParams.get('action');
    if (!leadId || !allLeads.length) {
      return;
    }

    const lead = allLeads.find((item) => item.id === leadId);
    if (!lead) {
      return;
    }

    openAiModalForLead(
      lead,
      action === 'payment_reminder'
        ? { purpose: 'payment', objective: 'Follow up on payment and ask for a clear payment date.' }
        : action === 'ask_budget'
          ? { purpose: 'follow-up', objective: 'Ask for budget and next-step timing.' }
          : { purpose: 'follow-up', objective: 'Send a concise follow-up and move the conversation forward.' }
    );
    setSearchParams({});
  }, [searchParams, allLeads]);

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
      setError(getApiErrorMessage(err, t.common.error));
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
      setError(getApiErrorMessage(err, t.common.error));
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
      setError(getApiErrorMessage(err, t.common.error));
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSortBy('date');
    setSortOrder('desc');
  };

  const handleImportFile = async (file?: File | null) => {
    if (!file) {
      return;
    }

    const text = await file.text();
    setImportText(text);
  };

  const handleImportLeads = async () => {
    try {
      setImporting(true);
      setError('');
      setImportSummary(null);
      const response = await leadsApi.importLeads({ csvText: importText });
      if (!response.success || !response.data) {
        setError(response.error?.message || t.leads.importFailed);
        if (response.usage) {
          setUsageInfo(response.usage);
        }
        return;
      }

      setImportSummary({
        importedCount: response.data.importedCount,
        skippedCount: response.data.skippedCount,
        totalRows: response.data.totalRows,
      });
      if (response.usage) {
        setUsageInfo(response.usage);
      } else {
        await loadUsageInfo();
      }
      setImportText('');
      await loadLeads();
    } catch (err) {
      setError(getApiErrorMessage(err, t.leads.importFailed));
    } finally {
      setImporting(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const blob = await leadsApi.exportCsv({
        q: searchTerm || undefined,
        status: statusFilter !== 'all' ? (statusFilter as LeadStatus) : undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads-export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(getApiErrorMessage(err, t.common.error));
    } finally {
      setExporting(false);
    }
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
    setGeneratedVariants([]);
    setSelectedVariantIndex(0);
    setCutoffSummary('');
    setMemorySummary('');
    setGenerationDebug(null);
    setGenerationStage('ready');
    setAdvancedOpen(false);
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
        setAllLeads((current) => current.map((item) => (item.id === refreshedLead.id ? refreshedLead : item)));
        setCurrentLead(refreshedLead);
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

  const openAiModalForLead = (lead: Lead, overrides?: Partial<SharedAiConfig>) => {
    setCurrentLead(lead);
    setConfig({
      ...getDefaultConfigFromUserPreferences(user, createInitialAiConfig(getDefaultQuickConfigForLead(lead, calculateDaysPassed(lead)).purpose)),
      ...getDefaultQuickConfigForLead(lead, calculateDaysPassed(lead)),
      ...overrides,
    });
    setGeneratedText('');
    setGeneratedVariants([]);
    setSelectedVariantIndex(0);
    setCutoffSummary('');
    setMemorySummary(lead.memorySummary || '');
    setGenerationDebug(null);
    setGenerationStage('ready');
    setShowAiModal(true);
    setError('');
    setAdvancedOpen(false);
    void hydrateLeadMemory(lead);
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
        const data = response.data;
        const variants = data.variants?.length ? data.variants : [data.text];
        setGeneratedVariants(variants);
        setSelectedVariantIndex(0);
        setGeneratedText(variants[0] || data.text);
        setCutoffSummary(data.cutoffSummary || '');
        setMemorySummary(data.memorySummary || memorySummary);
        if (data.memoryGoal) {
          setConfig((current) => ({ ...current, objective: data.memoryGoal || current.objective }));
        }
        setGenerationDebug(data.debug || null);
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
      setError(getApiErrorMessage(err, t.common.error));
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

  const handleSendViaWhatsapp = async () => {
    if (!currentLead?.contact || !generatedText.trim()) {
      setError('Lead needs a WhatsApp number and generated message before sending.');
      return;
    }

    try {
      setSendingViaWhatsapp(true);
      setError('');
      await whatsappApi.sendText({
        leadId: currentLead.id,
        toPhone: currentLead.contact,
        content: generatedText.trim(),
      });
      closeAiModal();
      await loadLeads();
      if (returnTo === 'dashboard') {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(getApiErrorMessage(err, t.common.error));
    } finally {
      setSendingViaWhatsapp(false);
    }
  };

  const statusColors: Record<string, string> = {
    new: 'var(--info)',
    waiting_reply: 'var(--warning)',
    follow_up_due: 'var(--primary)',
    won: 'var(--success)',
    lost: 'var(--text-secondary)',
  };

  const statusOptions = [
    { value: 'all', label: t.leads.allStatus },
    { value: 'new', label: t.status.new },
    { value: 'waiting_reply', label: t.status.waiting_reply },
    { value: 'follow_up_due', label: t.status.follow_up_due },
    { value: 'won', label: t.status.won },
    { value: 'lost', label: t.status.lost },
  ];

  const hasActiveFilters = searchTerm || statusFilter !== 'all';
  const stageLabelMap: Record<string, string> = {
    inquiry: 'Inquiry',
    booking: 'Booking',
    quoted: 'Quoted',
    payment: 'Payment',
    closed: 'Closed',
  };

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
      <AuthenticatedHeader title={t.leads.title} subtitle={t.dashboard.leadsNavBody} />

      <div className="page-header-inline-actions">
        <button onClick={handleExportCsv} className="btn btn-secondary" disabled={exporting}>
          {exporting ? t.common.loading : 'Export CSV'}
        </button>
        <button
          onClick={() => {
            setShowImport((value) => !value);
            setImportSummary(null);
            setError('');
          }}
          className="btn btn-secondary"
        >
          {t.leads.importContacts}
        </button>
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

      {showImport && (
        <div className="card form-card">
          <h2>{t.leads.importTitle}</h2>
          <p className="page-subtitle">{t.leads.importDescription}</p>
          <div className="form-group">
            <label className="form-label">{t.leads.importTextareaLabel}</label>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              className="input"
              rows={8}
              placeholder={t.leads.importPlaceholder}
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t.leads.importFileLabel}</label>
            <input
              type="file"
              accept=".csv,text/csv,.txt"
              className="input"
              onChange={(e) => void handleImportFile(e.target.files?.[0] || null)}
            />
          </div>
          {importSummary && (
            <div className="alert alert-success">
              <span>{translate(t.leads.importSummary, importSummary)}</span>
            </div>
          )}
          <div className="form-actions">
            <button
              type="button"
              onClick={handleImportLeads}
              className="btn btn-primary"
              disabled={importing || !importText.trim()}
            >
              {importing ? t.common.loading : t.leads.importSubmit}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowImport(false);
                setImportText('');
                setImportSummary(null);
              }}
              className="btn btn-secondary"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      )}

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
                <option value="waiting_reply">{t.status.waiting_reply}</option>
                <option value="follow_up_due">{t.status.follow_up_due}</option>
                <option value="won">{t.status.won}</option>
                <option value="lost">{t.status.lost}</option>
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
                    {(lead.stage || (lead.tags && lead.tags.length > 0)) && (
                      <div style={{ marginTop: '6px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {lead.stage ? (
                          <span className="badge badge-info">
                            {t.leads.stageLabel}: {stageLabelMap[lead.stage] || lead.stage}
                          </span>
                        ) : null}
                        {lead.tags?.map((tag) => (
                          <span key={`${lead.id}-tag-${tag}`} className="badge badge-secondary">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
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
                      <option value="waiting_reply">{t.status.waiting_reply}</option>
                      <option value="follow_up_due">{t.status.follow_up_due}</option>
                      <option value="won">{t.status.won}</option>
                      <option value="lost">{t.status.lost}</option>
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'grid', gap: '4px' }}>
                      <span>
                        {lead.nextFollowUpAt
                          ? `${t.leads.nextFollowUp}: ${new Date(lead.nextFollowUpAt).toLocaleDateString()}`
                          : lead.lastActivityAt
                            ? new Date(lead.lastActivityAt).toLocaleDateString()
                            : new Date(lead.createdAt).toLocaleDateString()}
                      </span>
                      {lead.nextFollowUpAt ? (
                        <span className="badge badge-primary">{t.leads.workflowActive}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {(lead.status === 'waiting_reply' || lead.status === 'follow_up_due' || lead.status === 'won') && (
                        <button onClick={() => openAiModalForLead(lead)} className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                          {lead.status === 'won' ? t.leads.helpCollectPayment : t.leads.helpFollowUp}
                        </button>
                      )}
                      {lead.status !== 'won' && lead.status !== 'lost' && (
                        <button
                          onClick={() => handleStatusChange(lead.id, 'won')}
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          {t.leads.closeDeal}
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
                {(memorySummary || refreshingMemory || config.objective) && (
                  <div className="ai-cutoff-card ai-cutoff-card-compact">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                      <strong>{t.ai.memoryPoint}</strong>
                      {currentLead ? (
                        <button className="btn btn-secondary" type="button" onClick={() => hydrateLeadMemory(currentLead)} disabled={refreshingMemory}>
                          {refreshingMemory ? t.ai.refreshingMemory : t.ai.refreshMemory}
                        </button>
                      ) : null}
                    </div>
                    {memorySummary ? <p>{memorySummary}</p> : null}
                    {config.objective ? <p><strong>{t.ai.memoryGoal}:</strong> {config.objective}</p> : null}
                  </div>
                )}

                {cutoffSummary && (
                  <div className="ai-cutoff-card ai-cutoff-card-compact">
                    <strong>{t.ai.conversationCutoff}</strong>
                    <p>{cutoffSummary}</p>
                  </div>
                )}

                {generatedVariants.length > 1 && (
                  <div className="ai-variant-row">
                    {generatedVariants.map((_, index) => (
                      <button
                        key={`leads-variant-${index}`}
                        type="button"
                        className={`btn ${selectedVariantIndex === index ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => {
                          setSelectedVariantIndex(index);
                          setGeneratedText(generatedVariants[index] || '');
                        }}
                      >
                        {translate(t.ai.variantOption, { index: index + 1 })}
                      </button>
                    ))}
                  </div>
                )}

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
                  onChange={(e) => {
                    const next = e.target.value;
                    setGeneratedText(next);
                    setGeneratedVariants((current) =>
                      current.length === 0
                        ? [next]
                        : current.map((item, index) => (index === selectedVariantIndex ? next : item))
                    );
                  }}
                  className="input generated-textarea quick-ai-textarea"
                  placeholder={t.ai.generatedTextPlaceholder}
                  rows={12}
                />

                <div className="quick-ai-actions">
                  <button onClick={handleCopyText} className="btn btn-success" disabled={!generatedText}>
                    {copied ? `✓ ${t.common.copied}` : `📋 ${t.leads.copyMessage}`}
                  </button>
                  <button onClick={handleSendViaWhatsapp} className="btn btn-primary" disabled={!generatedText || sendingViaWhatsapp || !currentLead.contact}>
                    {sendingViaWhatsapp ? t.dashboard.sending : t.dashboard.sendOnWhatsapp}
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
