import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { aiApi, leadsApi, Lead } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

const AI = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [purpose, setPurpose] = useState<'follow-up' | 'payment'>('follow-up');
  const [generatedText, setGeneratedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const { t, language } = useLanguage();
  const [formData, setFormData] = useState({
    daysPassed: 0,
    tone: 'polite',
    amount: 0,
    dueDate: '',
  });

  useEffect(() => {
    loadLeads();
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

  const handleGenerate = async () => {
    if (!selectedLead) {
      setError(t.ai.pleaseSelectLead);
      return;
    }

    setLoading(true);
    setError('');
    setGeneratedText('');

    try {
      let response;
      if (purpose === 'follow-up') {
        response = await aiApi.generateFollowUp({
          leadId: selectedLead.id,
          leadName: selectedLead.name,
          status: selectedLead.status,
          daysPassed: formData.daysPassed,
          tone: formData.tone,
          language: language as 'en' | 'zh-CN',
        });
      } else {
        response = await aiApi.generatePayment({
          leadId: selectedLead.id,
          leadName: selectedLead.name,
          amount: formData.amount > 0 ? formData.amount : undefined,
          dueDate: formData.dueDate || undefined,
          tone: formData.tone,
          language: language as 'en' | 'zh-CN',
        });
      }

      if (response.success && response.data) {
        setGeneratedText(response.data.text);
      } else {
        setError(response.error?.message || t.ai.failedToGenerate);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(t.common.error);
    }
  };

  const getStatusLabel = (status: string) => {
    return t.status[status as keyof typeof t.status] || status;
  };

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
          <div className="form-group">
            <label className="form-label">{t.ai.selectLead} *</label>
            <select
              value={selectedLead?.id || ''}
              onChange={(e) => {
                const lead = leads.find((l) => l.id === e.target.value);
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

          {purpose === 'follow-up' ? (
            <div className="form-group">
              <label className="form-label">{t.ai.daysPassed}</label>
              <input
                type="number"
                value={formData.daysPassed}
                onChange={(e) => setFormData({ ...formData, daysPassed: parseInt(e.target.value) || 0 })}
                min="0"
                className="input"
                placeholder={t.ai.daysPassedPlaceholder}
              />
            </div>
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

          <button
            onClick={handleGenerate}
            disabled={loading || !selectedLead}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
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
              <button onClick={handleCopy} className="btn btn-success">
                {copied ? `✓ ${t.common.copied}` : `📋 ${t.common.copy}`}
              </button>
            )}
          </div>
          <textarea
            value={generatedText}
            readOnly
            className="input generated-textarea"
            placeholder={t.ai.generatedTextPlaceholder}
            rows={15}
          />
        </div>
      </div>
    </div>
  );
};

export default AI;
