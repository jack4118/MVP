import { useEffect, useState } from 'react';
import {
  AiHistoryItem,
  getApiErrorMessage,
  Lead,
  UsageInfo,
  usageApi,
  whatsappApi,
  leadsApi,
  aiApi,
} from '../services/api';
import { translate, useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../hooks/useAuth';
import UpgradeModal from '../components/UpgradeModal';
import AuthenticatedHeader from '../components/AuthenticatedHeader';
import AiUsageCard from '../components/AiUsageCard';
import AiStatusPanel from '../components/AiStatusPanel';
import AiComposerFields from '../components/AiComposerFields';
import { shouldGateCopyForFree } from '../utils/paywall';
import { trackProductEvent } from '../utils/analytics';
import {
  createInitialAiConfig,
  generateAiMessage,
  GenerationStage,
  getDefaultConfigFromLeadMemory,
  getDefaultPurposeFromLeadStatus,
  getDefaultConfigFromUserPreferences,
  getEventPurpose,
  getHistoryPurposeLabel,
  getHistoryStyleLabel,
  SharedAiConfig,
  shouldRefreshLeadMemory,
} from '../features/ai/shared';

const AI = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [config, setConfig] = useState<SharedAiConfig>(createInitialAiConfig());
  const [generatedText, setGeneratedText] = useState('');
  const [refineInstruction, setRefineInstruction] = useState('');
  const [cutoffSummary, setCutoffSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [generationStage, setGenerationStage] = useState<GenerationStage>('ready');
  const [generationDebug, setGenerationDebug] = useState<any>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppPhone, setWhatsAppPhone] = useState('');
  const [history, setHistory] = useState<AiHistoryItem[]>([]);
  const [historyPurpose, setHistoryPurpose] = useState<'all' | 'follow_up' | 'payment'>('all');
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeSource, setUpgradeSource] = useState<'copy_gate' | 'ai_limit' | 'post_success' | 'generic'>('generic');
  const [memorySummary, setMemorySummary] = useState('');
  const [refreshingMemory, setRefreshingMemory] = useState(false);

  useEffect(() => {
    setConfig((current) => ({
      ...current,
      ...getDefaultConfigFromUserPreferences(user, current),
    }));
  }, [user]);

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
      setError(getApiErrorMessage(err, t.common.error));
    }
  };

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

  const loadHistory = async (purpose: 'all' | 'follow_up' | 'payment' = historyPurpose) => {
    try {
      const response = await aiApi.getHistory({ limit: 20, purpose });
      if (response.success && response.data) {
        setHistory(response.data);
      }
    } catch (_err) {
      // Non-blocking
    }
  };

  const openUpgradeModal = (source: 'copy_gate' | 'ai_limit' | 'post_success' | 'generic') => {
    setUpgradeSource(source);
    setShowUpgradeModal(true);
  };

  const updateConfig = (patch: Partial<SharedAiConfig>) => {
    setConfig((current) => ({ ...current, ...patch }));
    setError('');
  };

  const hydrateLeadMemory = async (lead: Lead) => {
    setMemorySummary(lead.memorySummary || '');
    setConfig((current) => ({
      ...current,
      ...getDefaultConfigFromUserPreferences(user, current),
      ...getDefaultConfigFromLeadMemory(lead, current),
    }));

    if (!shouldRefreshLeadMemory(lead, language)) {
      return lead;
    }

    try {
      setRefreshingMemory(true);
      const response = await leadsApi.refreshMemory(lead.id, language);
      if (response.success && response.data) {
        const refreshedLead = response.data.lead;
        setLeads((current) => current.map((item) => (item.id === refreshedLead.id ? refreshedLead : item)));
        setSelectedLead(refreshedLead);
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

  const handleGenerate = async () => {
    if (!selectedLead) {
      setError(t.ai.pleaseSelectLead);
      return;
    }
    if (!config.goal.trim()) {
      setError(t.ai.goalRequired);
      return;
    }
    const eventPurpose = getEventPurpose(getDefaultPurposeFromLeadStatus(selectedLead.status));

    trackProductEvent('ai_generate_clicked', {
      purpose: eventPurpose,
      leadId: selectedLead.id,
    });

    setLoading(true);
    setGenerationStage('thinking');
    setGenerationDebug(null);
    setError('');
    setGeneratedText('');
    setRefineInstruction('');
    setCutoffSummary('');
    setWhatsAppPhone(selectedLead.contact || '');

    try {
      const response = await generateAiMessage({ config, lead: selectedLead, language });

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

        if (response.usage) {
          setUsageInfo(response.usage);
          if (response.usage.aiUsageThisMonth === 1) {
            trackProductEvent('first_value_moment', { source: 'ai_page' });
          }
        } else {
          await loadUsageInfo();
        }

        trackProductEvent('ai_generate_success', {
          purpose: eventPurpose,
          leadId: selectedLead.id,
        });
        await loadHistory(historyPurpose);
        return;
      }

      setGenerationStage('ready');
      if (response.error?.code === 'AI_LIMIT_REACHED') {
        trackProductEvent('ai_generate_failed_limit', { purpose: eventPurpose });
        openUpgradeModal('ai_limit');
        if (response.usage) {
          setUsageInfo(response.usage);
        }
      }
      setError(response.error?.message || t.ai.failedToGenerate);
    } catch (err: any) {
      setGenerationStage('ready');
      if (err?.response?.data?.error?.code === 'AI_LIMIT_REACHED') {
        trackProductEvent('ai_generate_failed_limit', { purpose: eventPurpose });
        openUpgradeModal('ai_limit');
        if (err?.response?.data?.usage) {
          setUsageInfo(err.response.data.usage);
        }
      }
      setError(getApiErrorMessage(err, t.common.error));
    } finally {
      setLoading(false);
    }
  };

  const handleRefine = async () => {
    if (!selectedLead) {
      setError(t.ai.pleaseSelectLead);
      return;
    }
    if (!generatedText.trim()) {
      setError(t.ai.generatedTextPlaceholder);
      return;
    }
    if (!refineInstruction.trim()) {
      setError(t.ai.refineInstructionRequired);
      return;
    }

    setRefining(true);
    setGenerationStage('thinking');
    setError('');
    try {
      const response = await aiApi.refineMessage({
        leadId: selectedLead.id,
        originalText: generatedText.trim(),
        instruction: refineInstruction.trim(),
        style: config.style,
        channel: config.channel,
        emojiIntensity: config.emojiIntensity,
        language,
        purpose: getEventPurpose(getDefaultPurposeFromLeadStatus(selectedLead.status)),
      });

      if (response.success && response.data) {
        setGeneratedText(response.data.text);
        setGenerationDebug(response.data.debug || null);
        setGenerationStage('done');
        if (response.usage) {
          setUsageInfo(response.usage);
        }
        return;
      }

      setGenerationStage('ready');
      if (response.error?.code === 'AI_LIMIT_REACHED') {
        openUpgradeModal('ai_limit');
      }
      setError(response.error?.message || t.ai.failedToGenerate);
    } catch (err) {
      setGenerationStage('ready');
      setError(getApiErrorMessage(err, t.common.error));
    } finally {
      setRefining(false);
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

      const preflight = await whatsappApi.getPreflight(whatsAppPhone.trim());
      if (!preflight.success || !preflight.data || !preflight.data.canSendFreeform) {
        setError(preflight.error?.message || preflight.data?.reasonMessage || t.common.error);
        return;
      }

      const response = await whatsappApi.sendText({
        toPhone: whatsAppPhone,
        content: generatedText,
        leadId: selectedLead?.id,
      });

      if (!response.success) {
        setError(response.error?.message || t.common.error);
      }
    } catch (err) {
      const message =
        (err as any)?.response?.data?.error?.message ||
        (err instanceof Error ? err.message : t.common.error);
      setError(getApiErrorMessage(err, message));
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const getStatusLabel = (status: string) => t.status[status as keyof typeof t.status] || status;

  return (
    <div className="page-container">
      <AuthenticatedHeader title={t.ai.title} subtitle={t.ai.configurationSubtitle} />

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <div className="ai-generator-grid">
        <div className="card">
          <div className="section-heading">
            <h2>{t.ai.configuration}</h2>
            <p>{t.ai.configurationSubtitle}</p>
          </div>

          <AiUsageCard usageInfo={usageInfo} onUpgrade={() => openUpgradeModal('generic')} />

          <div className="form-group">
            <label className="form-label">{t.ai.selectLead} *</label>
            <select
              value={selectedLead?.id || ''}
              onChange={(e) => {
                const lead = leads.find((item) => item.id === e.target.value) || null;
                setSelectedLead(lead);
                setWhatsAppPhone(lead?.contact || '');
                setError('');
                if (lead) {
                  hydrateLeadMemory(lead);
                } else {
                  setMemorySummary('');
                }
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

          <AiComposerFields config={config} onChange={updateConfig} />

          {selectedLead && (memorySummary || refreshingMemory) && (
            <div className="ai-cutoff-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                <strong>{t.ai.memoryPoint}</strong>
                <button className="btn btn-secondary" type="button" onClick={() => hydrateLeadMemory(selectedLead)} disabled={refreshingMemory}>
                  {refreshingMemory ? t.ai.refreshingMemory : t.ai.refreshMemory}
                </button>
              </div>
              {memorySummary ? <p>{memorySummary}</p> : null}
              {config.goal ? (
                <p><strong>{t.ai.memoryGoal}:</strong> {config.goal}</p>
              ) : null}
            </div>
          )}

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

        <div className="card ai-result-card">
          <div className="generated-text-header">
            <div>
              <h2>{t.ai.generatedText}</h2>
              <p>{t.ai.resultPanelSubtitle}</p>
            </div>
            {generatedText && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleGenerate} className="btn btn-secondary" disabled={loading}>
                  {t.ai.regenerate}
                </button>
                <button onClick={handleCopy} className="btn btn-success">
                  {copied ? `✓ ${t.common.copied}` : `📋 ${t.common.copy}`}
                </button>
              </div>
            )}
          </div>

          {cutoffSummary && (
            <div className="ai-cutoff-card">
              <strong>{t.ai.conversationCutoff}</strong>
              <p>{cutoffSummary}</p>
            </div>
          )}

          {generatedText && usageInfo?.plan === 'free' && (
            <div className="post-success-card">
              <div>{translate(t.pricing.valueMessagesCreated, { count: usageInfo.aiUsageThisMonth })}</div>
              <button className="btn btn-primary" onClick={() => openUpgradeModal('post_success')}>
                {t.pricing.upgradePrompt}
              </button>
            </div>
          )}

          <textarea
            value={generatedText}
            onChange={(e) => {
              setGeneratedText(e.target.value);
            }}
            className="input generated-textarea"
            placeholder={t.ai.generatedTextPlaceholder}
            rows={15}
          />

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label className="form-label">{t.ai.refinementInstruction}</label>
            <input
              className="input"
              value={refineInstruction}
              onChange={(e) => setRefineInstruction(e.target.value)}
              placeholder={t.ai.refinementPlaceholder}
            />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button className="btn btn-secondary" onClick={handleGenerate} disabled={loading}>
                {t.ai.regenerate}
              </button>
              <button className="btn btn-primary" onClick={handleRefine} disabled={refining || !generatedText.trim()}>
                {refining ? t.ai.refining : t.ai.refine}
              </button>
            </div>
          </div>

          {generatedText && (
            <div className="whatsapp-send-panel">
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

          <AiStatusPanel generationStage={generationStage} generationDebug={generationDebug} />
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
              <div key={item.id} className="ai-history-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                  <strong>{item.lead.name}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="ai-history-tags">
                  <span className={`ai-tag ${item.purpose === 'payment' ? 'ai-tag-payment' : 'ai-tag-followup'}`}>
                    {getHistoryPurposeLabel(t, item.purpose)}
                  </span>
                  {item.stylePreset && (
                    <span className="ai-tag ai-tag-style">{getHistoryStyleLabel(t, item.purpose, item.stylePreset)}</span>
                  )}
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
