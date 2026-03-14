import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthenticatedHeader from '../components/AuthenticatedHeader';
import {
  getConversationModeOptions,
  getEmojiOptions,
  getOutputFormatOptions,
  getToneOptions,
} from '../features/ai/shared';
import { useAuth } from '../hooks/useAuth';
import { AiTone, AppLanguage, ConversationMode, EmojiDensity, OutputFormat } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { getApiErrorMessage } from '../services/api';

const Profile = () => {
  const { t } = useLanguage();
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    displayName: '',
    companyName: '',
    industry: '',
    defaultLanguage: 'en' as AppLanguage,
    defaultTone: 'polite' as AiTone,
    defaultConversationMode: 'standard' as ConversationMode,
    defaultEmojiDensity: 'medium' as EmojiDensity,
    defaultOutputFormat: 'whatsapp' as OutputFormat,
    defaultFollowUpDays: 3,
    defaultCountryCode: '60',
    inboxDefaultView: 'inbox' as 'inbox' | 'contacts' | 'setup',
  });
  const isSetupFlow = searchParams.get('setup') === '1';
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  useEffect(() => {
    if (!user) {
      return;
    }

    setForm({
      displayName: user.displayName || '',
      companyName: user.companyName || '',
      industry: user.industry || '',
      defaultLanguage: user.defaultLanguage || 'en',
      defaultTone: user.defaultTone || 'polite',
      defaultConversationMode: user.defaultConversationMode || 'standard',
      defaultEmojiDensity: user.defaultEmojiDensity || 'medium',
      defaultOutputFormat: user.defaultOutputFormat || 'whatsapp',
      defaultFollowUpDays: user.defaultFollowUpDays ?? 3,
      defaultCountryCode: user.defaultCountryCode || '60',
      inboxDefaultView: user.inboxDefaultView || 'inbox',
    });
  }, [user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const response = await updateProfile({
        hasCompletedOnboarding: true,
        displayName: form.displayName.trim() || null,
        companyName: form.companyName.trim() || null,
        industry: form.industry.trim() || null,
        defaultLanguage: form.defaultLanguage,
        defaultTone: form.defaultTone,
        defaultConversationMode: form.defaultConversationMode,
        defaultEmojiDensity: form.defaultEmojiDensity,
        defaultOutputFormat: form.defaultOutputFormat,
        defaultFollowUpDays: form.defaultFollowUpDays,
        defaultCountryCode: form.defaultCountryCode.trim() || null,
        inboxDefaultView: form.inboxDefaultView,
      });

      if (!response.success) {
        setError(response.error?.message || t.profile.saveFailed);
        return;
      }

      setSuccess(t.profile.saveSuccess);
      if (isSetupFlow) {
        navigate(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(getApiErrorMessage(err, t.profile.saveFailed));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-container">
      <AuthenticatedHeader title={t.profile.title} subtitle={t.profile.subtitle} />

      {isSetupFlow ? (
        <div className="alert alert-success">
          <span>{t.profile.setupNotice}</span>
        </div>
      ) : null}

      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <form className="profile-grid" onSubmit={handleSubmit}>
        <section className="card">
          <div className="section-heading">
            <h3>{t.profile.basicInfoTitle}</h3>
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.emailReadOnly}</label>
            <input className="input" value={user?.email || ''} disabled />
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.displayName}</label>
            <input
              className="input"
              value={form.displayName}
              onChange={(e) => setForm((current) => ({ ...current, displayName: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.companyName}</label>
            <input
              className="input"
              value={form.companyName}
              onChange={(e) => setForm((current) => ({ ...current, companyName: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.industry}</label>
            <input
              className="input"
              value={form.industry}
              onChange={(e) => setForm((current) => ({ ...current, industry: e.target.value }))}
              placeholder={t.profile.industryPlaceholder}
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.defaultCountryCode}</label>
            <input
              className="input"
              value={form.defaultCountryCode}
              onChange={(e) => setForm((current) => ({ ...current, defaultCountryCode: e.target.value }))}
            />
          </div>
        </section>

        <section className="card">
          <div className="section-heading">
            <h3>{t.profile.aiDefaultsTitle}</h3>
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.defaultLanguage}</label>
            <select
              className="input"
              value={form.defaultLanguage}
              onChange={(e) => setForm((current) => ({ ...current, defaultLanguage: e.target.value as AppLanguage }))}
            >
              <option value="en">EN</option>
              <option value="zh-CN">中文</option>
              <option value="ms">BM</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.defaultTone}</label>
            <select
              className="input"
              value={form.defaultTone}
              onChange={(e) => setForm((current) => ({ ...current, defaultTone: e.target.value as AiTone }))}
            >
              {getToneOptions(t).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.defaultConversationMode}</label>
            <select
              className="input"
              value={form.defaultConversationMode}
              onChange={(e) =>
                setForm((current) => ({ ...current, defaultConversationMode: e.target.value as ConversationMode }))
              }
            >
              {getConversationModeOptions(t).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.defaultEmojiDensity}</label>
            <select
              className="input"
              value={form.defaultEmojiDensity}
              onChange={(e) =>
                setForm((current) => ({ ...current, defaultEmojiDensity: e.target.value as EmojiDensity }))
              }
            >
              {getEmojiOptions(t).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.defaultOutputFormat}</label>
            <select
              className="input"
              value={form.defaultOutputFormat}
              onChange={(e) =>
                setForm((current) => ({ ...current, defaultOutputFormat: e.target.value as OutputFormat }))
              }
            >
              {getOutputFormatOptions(t).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.defaultFollowUpDays}</label>
            <input
              className="input"
              type="number"
              min={0}
              max={30}
              value={form.defaultFollowUpDays}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  defaultFollowUpDays: Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0,
                }))
              }
            />
          </div>
        </section>

        <section className="card">
          <div className="section-heading">
            <h3>{t.profile.inboxDefaultsTitle}</h3>
          </div>

          <div className="form-group">
            <label className="form-label">{t.profile.inboxDefaultView}</label>
            <select
              className="input"
              value={form.inboxDefaultView}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  inboxDefaultView: e.target.value as 'inbox' | 'contacts' | 'setup',
                }))
              }
            >
              <option value="inbox">{t.profile.inboxViewInbox}</option>
              <option value="contacts">{t.profile.inboxViewContacts}</option>
              <option value="setup">{t.profile.inboxViewSetup}</option>
            </select>
          </div>
        </section>

        <div className="profile-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t.common.loading : t.common.save}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Profile;
