import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  aiApi,
  leadsApi,
  usageApi,
  whatsappApi,
  Lead,
  UsageInfo,
  FollowUpStylePreset,
  PaymentStylePreset,
  OutputFormat,
  AiHistoryItem,
} from '../services/api';
import { useLanguage, translate } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import UpgradeModal from '../components/UpgradeModal';
import { shouldGateCopyForFree } from '../utils/paywall';
import { trackProductEvent } from '../utils/analytics';

const aiPresetsEnabled = import.meta.env.VITE_FEATURE_AI_PRESETS !== 'false';

const AI = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [purpose, setPurpose] = useState<'follow-up' | 'payment'>('follow-up');
  const [generatedText, setGeneratedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState('');
  const [history, setHistory] = useState<AiHistoryItem[]>([]);
  const [historyPurpose, setHistoryPurpose] = useState<'all' | 'follow_up' | 'payment'>('all');
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeSource, setUpgradeSource] = useState<'copy_gate' | 'ai_limit' | 'post_success' | 'generic'>('generic');
  const { t, language } = useLanguage();
  const [formData, setFormData] = useState({
    daysPassed: 0,
    tone: 'polite',
    objective: '',
    amount: 0,
    dueDate: '',
    outputFormat: 'chat' as OutputFormat,
    followUpStylePreset: 'gentle_nudge' as FollowUpStylePreset,
    paymentStylePreset: 'friendly_reminder' as PaymentStylePreset,
  });

  useEffect(() => {
    loadLeads();
    loadUsageInfo();
    loadHistory('all');
  }, []);

  const loadLeads = async () => {
    try {
      const response = await leadsApi.getLeads();
      if (response.success && response.data) {
        setLeads(response.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    }
  };

  const loadUsageInfo = async () => {
    try {
      const response = await usageApi.getUsage();
      if (response.success && response.data) {
        setUsageInfo(response.data);
      }
    } catch (_err) {
      // Usage is optional for rendering
    }
  };

  const loadHistory = async (purpose: 'all' | 'follow_up' | 'payment' = historyPurpose) => {
    try {
      const response = await aiApi.getHistory({ limit: 20, purpose });
      if (response.success && response.data) {
        setHistory(response.data);
      }
    } catch (_err) {
      // Non-blocking section
    }
  };

  const openUpgradeModal = (source: 'copy_gate' | 'ai_limit' | 'post_success' | 'generic') => {
    setUpgradeSource(source);
    setShowUpgradeModal(true);
  };

  const handleGenerate = async () => {
    if (!selectedLead) {
      setError(t.ai.pleaseSelectLead);
      return;
    }
    if (!formData.objective.trim()) {
      setError(t.ai.objectiveRequired);
      return;
    }

    trackProductEvent('ai_generate_clicked', {
      purpose,
      leadId: selectedLead.id,
    });

    setLoading(true);
    setError('');
    setGeneratedText('');
    setWhatsAppPhone(selectedLead.contact || '');

    try {
      let response;
      if (purpose === 'follow-up') {
        response = await aiApi.generateFollowUp({
          leadId: selectedLead.id,
          leadName: selectedLead.name,
          objective: formData.objective.trim(),
          status: selectedLead.status,
          daysPassed: formData.daysPassed,
          tone: formData.tone as 'polite' | 'friendly' | 'professional' | 'casual',
          stylePreset: aiPresetsEnabled ? formData.followUpStylePreset : undefined,
          outputFormat: formData.outputFormat,
          language,
        });
      } else {
        response = await aiApi.generatePayment({
          leadId: selectedLead.id,
          leadName: selectedLead.name,
          objective: formData.objective.trim(),
          amount: formData.amount > 0 ? formData.amount : undefined,
          dueDate: formData.dueDate || undefined,
          tone: formData.tone as 'polite' | 'friendly' | 'professional' | 'casual',
          stylePreset: aiPresetsEnabled ? formData.paymentStylePreset : undefined,
          outputFormat: formData.outputFormat,
          language,
        });
      }

      if (response.success && response.data) {
        setGeneratedText(response.data.text);

        if (response.usage) {
          setUsageInfo(response.usage);
          if (response.usage.aiUsageThisMonth === 1) {
            trackProductEvent('first_value_moment', { source: 'ai_page' });
          }
        } else {
          await loadUsageInfo();
        }

        trackProductEvent('ai_generate_success', {
          purpose,
          leadId: selectedLead.id,
        });
        await loadHistory(historyPurpose);
      } else {
        if (response.error?.code === 'AI_LIMIT_REACHED') {
          trackProductEvent('ai_generate_failed_limit', { purpose });
          openUpgradeModal('ai_limit');
          if (response.usage) {
            setUsageInfo(response.usage);
          }
        }
        setError(response.error?.message || t.ai.failedToGenerate);
      }
    } catch (err: any) {
      if (err?.response?.data?.error?.code === 'AI_LIMIT_REACHED') {
        trackProductEvent('ai_generate_failed_limit', { purpose });
        openUpgradeModal('ai_limit');
        if (err?.response?.data?.usage) {
          setUsageInfo(err.response.data.usage);
        }
      }
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    const shouldGate = shouldGateCopyForFree(usageInfo);
    trackProductEvent('copy_clicked', {
      source: 'ai_page',
      gated: shouldGate,
    });

    if (shouldGate) {
      openUpgradeModal('copy_gate');
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

  const handleRegenerate = async () => {
    await handleGenerate();
  };

  const handleSendWhatsApp = async () => {
    if (!generatedText.trim()) {
      return;
    }
    if (!whatsAppPhone.trim()) {
      setError(t.ai.recipientPhoneRequired);
      return;
    }

    try {
      setSendingWhatsApp(true);
      setError('');
      const response = await whatsappApi.sendText({
        toPhone: whatsAppPhone,
        content: generatedText,
        leadId: selectedLead?.id,
      });

      if (!response.success) {
        setError(response.error?.message || t.common.error);
        return;
      }
    } catch (err) {
      const message =
        (err as any)?.response?.data?.error?.message ||
        (err instanceof Error ? err.message : t.common.error);
      setError(message);
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const getStatusLabel = (status: string) => t.status[status as keyof typeof t.status] || status;

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
          <h1 className="page-title">{t.ai.title}</h1>
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

      <div className="ai-generator-grid">
        <div className="card">
          <h2>{t.ai.configuration}</h2>

          {usageInfo && usageInfo.plan === 'free' && (
            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'var(--warning)', color: 'var(--bg-primary)', borderRadius: '8px', fontSize: '14px', textAlign: 'center' }}>
              {usageInfo.aiLimit !== null
                ? translate(t.pricing.aiMessagesLeft, { count: usageInfo.aiRemaining ?? 0 })
                : t.pricing.aiMessagesLeftUnlimited}
              {usageInfo.aiLimit !== null && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '12px', marginBottom: '6px' }}>
                    {translate(t.pricing.usageProgress, { used: usageInfo.aiUsageThisMonth, limit: usageInfo.aiLimit })}
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.15)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${usageInfo.aiUsagePercent}%`, height: '100%', background: 'var(--bg-primary)' }} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">{t.ai.selectLead} *</label>
            <select
              value={selectedLead?.id || ''}
              onChange={(e) => {
                const lead = leads.find((item) => item.id === e.target.value);
                setSelectedLead(lead || null);
                setError('');
              }}
              className="input"
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
            <label className="form-label">{t.ai.purpose} *</label>
            <select
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value as 'follow-up' | 'payment');
                setError('');
              }}
              className="input"
            >
              <option value="follow-up">{t.ai.followUp}</option>
              <option value="payment">{t.ai.payment}</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t.ai.objective} *</label>
            <textarea
              value={formData.objective}
              onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
              className="input"
              rows={3}
              placeholder={t.ai.objectivePlaceholder}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t.ai.outputFormat}</label>
            <select
              value={formData.outputFormat}
              onChange={(e) => setFormData({ ...formData, outputFormat: e.target.value as OutputFormat })}
              className="input"
            >
              <option value="chat">{t.ai.formatChat}</option>
              <option value="email">{t.ai.formatEmail}</option>
              <option value="whatsapp">{t.ai.formatWhatsapp}</option>
            </select>
          </div>

          {purpose === 'follow-up' ? (
            <>
              <div className="form-group">
                <label className="form-label">{t.ai.daysPassed}</label>
                <input
                  type="number"
                  value={formData.daysPassed}
                  onChange={(e) => setFormData({ ...formData, daysPassed: parseInt(e.target.value, 10) || 0 })}
                  min="0"
                  className="input"
                  placeholder={t.ai.daysPassedPlaceholder}
                />
              </div>

              {aiPresetsEnabled && (
                <div className="form-group">
                  <label className="form-label">{t.ai.stylePreset}</label>
                  <select
                    value={formData.followUpStylePreset}
                    onChange={(e) => setFormData({ ...formData, followUpStylePreset: e.target.value as FollowUpStylePreset })}
                    className="input"
                  >
                    <option value="gentle_nudge">{t.ai.followUpPresetGentleNudge}</option>
                    <option value="value_reminder">{t.ai.followUpPresetValueReminder}</option>
                    <option value="meeting_request">{t.ai.followUpPresetMeetingRequest}</option>
                  </select>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">{t.ai.amount}</label>
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  min="0"
                  step="0.01"
                  className="input"
                  placeholder={t.ai.amountPlaceholder}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.ai.dueDate}</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="input"
                />
              </div>

              {aiPresetsEnabled && (
                <div className="form-group">
                  <label className="form-label">{t.ai.stylePreset}</label>
                  <select
                    value={formData.paymentStylePreset}
                    onChange={(e) => setFormData({ ...formData, paymentStylePreset: e.target.value as PaymentStylePreset })}
                    className="input"
                  >
                    <option value="friendly_reminder">{t.ai.paymentPresetFriendlyReminder}</option>
                    <option value="due_today">{t.ai.paymentPresetDueToday}</option>
                    <option value="overdue_escalation">{t.ai.paymentPresetOverdueEscalation}</option>
                  </select>
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <label className="form-label">{t.ai.tone}</label>
            <select
              value={formData.tone}
              onChange={(e) => setFormData({ ...formData, tone: e.target.value })}
              className="input"
            >
              <option value="polite">{t.ai.polite}</option>
              <option value="friendly">{t.ai.friendly}</option>
              <option value="professional">{t.ai.professional}</option>
              <option value="casual">{t.ai.casual}</option>
            </select>
          </div>

          <button onClick={handleGenerate} disabled={loading || !selectedLead} className="btn btn-primary" style={{ width: '100%' }}>
            {loading ? (
              <>
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                <span>{t.ai.generating}</span>
              </>
            ) : (
              <span>{t.ai.generateText}</span>
            )}
          </button>
        </div>

        <div className="card">
          <div className="generated-text-header">
            <h2>{t.ai.generatedText}</h2>
            {generatedText && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleRegenerate} className="btn btn-secondary" disabled={loading}>
                  {t.ai.regenerateVariant}
                </button>
                <button onClick={handleCopy} className="btn btn-success">
                  {copied ? `✓ ${t.common.copied}` : `📋 ${t.common.copy}`}
                </button>
              </div>
            )}
          </div>

          {generatedText && usageInfo?.plan === 'free' && (
            <div style={{ marginBottom: '12px', padding: '10px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '14px' }}>
              <div>{translate(t.pricing.valueMessagesCreated, { count: usageInfo.aiUsageThisMonth })}</div>
              <button
                className="btn btn-primary"
                style={{ marginTop: '8px', padding: '6px 10px', fontSize: '12px' }}
                onClick={() => openUpgradeModal('post_success')}
              >
                {t.pricing.upgradePrompt}
              </button>
            </div>
          )}

          <textarea
            value={generatedText}
            onChange={(e) => setGeneratedText(e.target.value)}
            className="input generated-textarea"
            placeholder={t.ai.generatedTextPlaceholder}
            rows={15}
          />
          {generatedText && (
            <div style={{ marginTop: '10px', display: 'grid', gap: '8px' }}>
              <input
                className="input"
                value={whatsAppPhone}
                onChange={(e) => setWhatsAppPhone(e.target.value)}
                placeholder={t.ai.whatsappPhonePlaceholder}
              />
              <button className="btn btn-primary" onClick={handleSendWhatsApp} disabled={sendingWhatsApp}>
                {sendingWhatsApp ? t.common.loading : t.ai.sendViaWhatsapp}
              </button>
            </div>
          )}
        </div>
      </div>

      <UpgradeModal
        isOpen={showUpgradeModal}
        source={upgradeSource}
        generatedCount={usageInfo?.aiUsageThisMonth || 0}
        onClose={() => setShowUpgradeModal(false)}
        onUpgradeSuccess={() => {
          loadUsageInfo();
        }}
      />

      <div className="card" style={{ marginTop: '20px' }}>
        <div className="ai-history-header">
          <h2 style={{ margin: 0 }}>{t.ai.historyTitle}</h2>
          <div className="ai-history-controls">
            <select
              className="input"
              style={{ width: '160px' }}
              value={historyPurpose}
              onChange={(e) => {
                const next = e.target.value as 'all' | 'follow_up' | 'payment';
                setHistoryPurpose(next);
                loadHistory(next);
              }}
            >
              <option value="all">{t.ai.historyAll}</option>
              <option value="follow_up">{t.ai.historyFollowUp}</option>
              <option value="payment">{t.ai.historyPayment}</option>
            </select>
            <button className="btn btn-secondary" onClick={() => loadHistory(historyPurpose)}>
              {t.ai.historyRefresh}
            </button>
          </div>
        </div>

        {history.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t.ai.historyEmpty}</p>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {history.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  background: 'linear-gradient(135deg, rgba(80,140,200,0.08), rgba(60,180,120,0.06))',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                  <strong>{item.lead.name}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <div style={{ marginBottom: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {item.purpose} {item.stylePreset ? `• ${item.stylePreset}` : ''}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{item.content}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AI;
