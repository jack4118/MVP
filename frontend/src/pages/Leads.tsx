import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { leadsApi, aiApi, usageApi, Lead, UsageInfo } from '../services/api';
import { useLanguage, translate } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import UpgradeModal from '../components/UpgradeModal';

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
    status: 'new',
  });

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // AI Modal states
  const [showAiModal, setShowAiModal] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [copied, setCopied] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

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
    } catch (err) {
      // Silently fail - usage info is optional
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

  // Filter and sort leads
  const filteredAndSortedLeads = useMemo(() => {
    let filtered = [...allLeads];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (lead) =>
          lead.name.toLowerCase().includes(term) ||
          lead.contact?.toLowerCase().includes(term) ||
          lead.notes?.toLowerCase().includes(term)
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((lead) => lead.status === statusFilter);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'date':
        default:
          const dateA = new Date(a.lastActivityAt || a.createdAt).getTime();
          const dateB = new Date(b.lastActivityAt || b.createdAt).getTime();
          comparison = dateA - dateB;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [allLeads, searchTerm, statusFilter, sortBy, sortOrder]);

  // Update displayed leads when filters change
  useEffect(() => {
    setLeads(filteredAndSortedLeads);
  }, [filteredAndSortedLeads]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingLead) {
        await leadsApi.updateLead(editingLead.id, formData);
      } else {
        await leadsApi.createLead(formData);
      }
      setShowForm(false);
      setEditingLead(null);
      setFormData({ name: '', contact: '', notes: '', status: 'new' });
      setError('');
      loadLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    try {
      await leadsApi.updateLeadStatus(leadId, newStatus);
      loadLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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
    const now = Date.now();
    const activityTime = new Date(lastActivity).getTime();
    return Math.floor((now - activityTime) / (1000 * 60 * 60 * 24));
  };

  const handleAiFollowUp = async (lead: Lead) => {
    setCurrentLead(lead);
    setShowAiModal(true);
    setGeneratedText('');
    setAiLoading(true);
    setError('');

    try {
      const daysPassed = calculateDaysPassed(lead);
      const response = await aiApi.generateFollowUp({
        leadId: lead.id,
        leadName: lead.name,
        status: lead.status,
        daysPassed,
        tone: 'polite',
        language: language as 'en' | 'zh-CN',
      });

      if (response.success && response.data) {
        setGeneratedText(response.data.text);
        // Update usage info from response
        if ((response as any).usage) {
          setUsageInfo((response as any).usage);
        } else {
          await loadUsageInfo();
        }
      } else {
        // Check if it's a limit error
        if (response.error?.code === 'AI_LIMIT_REACHED') {
          setShowUpgradeModal(true);
          if ((response as any).usage) {
            setUsageInfo((response as any).usage);
          }
        }
        setError(response.error?.message || t.ai.failedToGenerate);
        setShowAiModal(false);
      }
    } catch (err: any) {
      // Check if it's a limit error from axios response
      if (err?.response?.data?.error?.code === 'AI_LIMIT_REACHED') {
        setShowUpgradeModal(true);
        if (err?.response?.data?.usage) {
          setUsageInfo(err.response.data.usage);
        }
      }
      setError(err instanceof Error ? err.message : t.common.error);
      setShowAiModal(false);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiPayment = async (lead: Lead) => {
    setCurrentLead(lead);
    setShowAiModal(true);
    setGeneratedText('');
    setAiLoading(true);
    setError('');

    try {
      const response = await aiApi.generatePayment({
        leadId: lead.id,
        leadName: lead.name,
        tone: 'polite',
        language: language as 'en' | 'zh-CN',
      });

      if (response.success && response.data) {
        setGeneratedText(response.data.text);
        // Update usage info from response
        if ((response as any).usage) {
          setUsageInfo((response as any).usage);
        } else {
          await loadUsageInfo();
        }
      } else {
        // Check if it's a limit error
        if (response.error?.code === 'AI_LIMIT_REACHED') {
          setShowUpgradeModal(true);
          if ((response as any).usage) {
            setUsageInfo((response as any).usage);
          }
        }
        setError(response.error?.message || t.ai.failedToGenerate);
        setShowAiModal(false);
      }
    } catch (err: any) {
      // Check if it's a limit error from axios response
      if (err?.response?.data?.error?.code === 'AI_LIMIT_REACHED') {
        setShowUpgradeModal(true);
        if (err?.response?.data?.usage) {
          setUsageInfo(err.response.data.usage);
        }
      }
      setError(err instanceof Error ? err.message : t.common.error);
      setShowAiModal(false);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyText = async () => {
    // Check if user is on free plan
    if (usageInfo && usageInfo.plan === 'free') {
      setShowUpgradeModal(true);
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
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
    { value: 'all', label: 'All Status' },
    { value: 'new', label: 'New' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'interested', label: 'Interested' },
    { value: 'waiting_reply', label: 'Waiting Reply' },
    { value: 'not_interested', label: 'Not Interested' },
    { value: 'closed', label: 'Closed' },
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
          <h1 className="page-title">{t.leads.title}</h1>
        </div>
        <div className="header-actions">
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

      {/* Filters Section */}
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
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label className="form-label">{t.leads.sortBy}</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'date' | 'status')}
              className="input"
            >
              <option value="date">{t.leads.date}</option>
              <option value="name">{t.leads.name}</option>
              <option value="status">{t.leads.status}</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="form-label">{t.leads.order}</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="input"
            >
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
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="input"
              >
                <option value="new">{t.status.new}</option>
                <option value="contacted">{t.status.contacted}</option>
                <option value="interested">{t.status.interested}</option>
                <option value="waiting_reply">{t.status.waitingReply}</option>
                <option value="not_interested">{t.status.notInterested}</option>
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
          <h3>
            {hasActiveFilters ? t.leads.noLeadsMatch : t.leads.noLeads}
          </h3>
          <p>
            {hasActiveFilters
              ? t.leads.noLeadsMatchMessage
              : t.leads.noLeadsMessage}
          </p>
          {hasActiveFilters ? (
            <button onClick={clearFilters} className="btn btn-primary">
              {t.leads.clearFilters}
            </button>
          ) : (
            <button
              onClick={() => {
                setShowForm(true);
                setEditingLead(null);
                setFormData({ name: '', contact: '', notes: '', status: 'new' });
              }}
              className="btn btn-primary"
            >
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
                      onChange={(e) => handleStatusChange(lead.id, e.target.value)}
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
                      <option value="waiting_reply">{t.status.waitingReply}</option>
                      <option value="not_interested">{t.status.notInterested}</option>
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
                      {lead.status === 'waiting_reply' && (
                        <button
                          onClick={() => handleAiFollowUp(lead)}
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          {t.leads.helpFollowUp}
                        </button>
                      )}
                      {lead.status === 'closed' && (
                        <button
                          onClick={() => handleAiPayment(lead)}
                          className="btn btn-primary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          {t.leads.helpCollectPayment}
                        </button>
                      )}
                    <button
                      onClick={() => handleEdit(lead)}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
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

      {/* AI Modal */}
      {showAiModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => {
            if (!aiLoading) {
              setShowAiModal(false);
              setGeneratedText('');
              setCurrentLead(null);
            }
          }}
        >
          <div
            className="card"
            style={{
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2>{t.leads.aiModalTitle}</h2>
              <button
                onClick={() => {
                  setShowAiModal(false);
                  setGeneratedText('');
                  setCurrentLead(null);
                }}
                className="btn btn-secondary"
                style={{ padding: '6px 12px' }}
                disabled={aiLoading}
              >
                {t.common.close}
              </button>
            </div>

            {currentLead && (
              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px' }}>
                <strong>{t.leads.name}:</strong> {currentLead.name}
                {currentLead.contact && (
                  <>
                    <br />
                    <strong>{t.leads.contact}:</strong> {currentLead.contact}
                  </>
                )}
              </div>
            )}

            {usageInfo && usageInfo.plan === 'free' && (
              <div style={{ 
                marginBottom: '16px', 
                padding: '12px', 
                backgroundColor: 'var(--warning)', 
                color: 'var(--bg-primary)',
                borderRadius: '8px',
                fontSize: '14px',
                textAlign: 'center',
              }}>
                {usageInfo.aiLimit !== null
                  ? translate(t.pricing.aiMessagesLeft, { count: Math.max(0, usageInfo.aiLimit - usageInfo.aiUsageThisMonth) })
                  : t.pricing.aiMessagesLeftUnlimited}
              </div>
            )}

            {aiLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <div className="spinner" style={{ margin: '0 auto' }}></div>
                <p style={{ marginTop: '16px' }}>{t.ai.generating}</p>
              </div>
            ) : (
              <>
                <textarea
                  value={generatedText}
                  readOnly
                  className="input"
                  style={{
                    minHeight: '200px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                  placeholder={t.ai.generatedTextPlaceholder}
                />
                {generatedText && (
                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={handleCopyText} 
                      className="btn btn-success"
                      style={{
                        opacity: usageInfo && usageInfo.plan === 'free' ? 0.7 : 1,
                      }}
                    >
                      {copied ? `✓ ${t.common.copied}` : `📋 ${t.leads.copyMessage}`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      <UpgradeModal 
        isOpen={showUpgradeModal} 
        onClose={() => setShowUpgradeModal(false)}
        onUpgradeSuccess={() => {
          loadUsageInfo();
        }}
      />
    </div>
  );
};

export default Leads;
