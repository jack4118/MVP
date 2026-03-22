import { useEffect, useMemo, useState } from 'react';
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
import { getApiErrorMessage } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

type SettingsTab = 'profile' | 'ai' | 'notifications' | 'security';

const Settings = () => {
  const { t } = useLanguage();
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>('profile');
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
    notifyNewInbound: true,
    notifyReminderDue: true,
    notifyDailyDigestHour: 9,
  });

  const isSetupFlow = searchParams.get('setup') === '1';
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  useEffect(() => {
    if (!user) return;
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
      notifyNewInbound: user.notifyNewInbound ?? true,
      notifyReminderDue: user.notifyReminderDue ?? true,
      notifyDailyDigestHour: user.notifyDailyDigestHour ?? 9,
    });
  }, [user]);

  const securityInfo = useMemo(() => ({
    lastPasswordAt: user?.securityLastPasswordAt ? new Date(user.securityLastPasswordAt).toLocaleString() : '-',
    lastLoginAt: user?.securityLastLoginAt ? new Date(user.securityLastLoginAt).toLocaleString() : '-',
  }), [user?.securityLastLoginAt, user?.securityLastPasswordAt]);

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
        notifyNewInbound: form.notifyNewInbound,
        notifyReminderDue: form.notifyReminderDue,
        notifyDailyDigestHour: form.notifyDailyDigestHour,
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

      <div className="whatsapp-view-switch">
        <button className={`whatsapp-view-tab ${tab === 'profile' ? 'whatsapp-view-tab-active' : ''}`} onClick={() => setTab('profile')}>{t.profile.tabProfile}</button>
        <button className={`whatsapp-view-tab ${tab === 'ai' ? 'whatsapp-view-tab-active' : ''}`} onClick={() => setTab('ai')}>{t.profile.tabAiDefaults}</button>
        <button className={`whatsapp-view-tab ${tab === 'notifications' ? 'whatsapp-view-tab-active' : ''}`} onClick={() => setTab('notifications')}>{t.profile.tabNotifications}</button>
        <button className={`whatsapp-view-tab ${tab === 'security' ? 'whatsapp-view-tab-active' : ''}`} onClick={() => setTab('security')}>{t.profile.tabSecurity}</button>
      </div>

      {isSetupFlow ? <div className="alert alert-success"><span>{t.profile.setupNotice}</span></div> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {success ? <div className="alert alert-success">{success}</div> : null}

      <form className="profile-grid" onSubmit={handleSubmit}>
        {(tab === 'profile' || tab === 'ai') && (
          <section className="card">
            <div className="section-heading">
              <h3>{tab === 'profile' ? t.profile.basicInfoTitle : t.profile.aiDefaultsTitle}</h3>
            </div>

            {tab === 'profile' ? (
              <>
                <div className="form-group">
                  <label className="form-label">{t.profile.emailReadOnly}</label>
                  <input className="input" value={user?.email || ''} disabled />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.profile.displayName}</label>
                  <input className="input" value={form.displayName} onChange={(e) => setForm((c) => ({ ...c, displayName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.profile.companyName}</label>
                  <input className="input" value={form.companyName} onChange={(e) => setForm((c) => ({ ...c, companyName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t.profile.industry}</label>
                  <input className="input" value={form.industry} onChange={(e) => setForm((c) => ({ ...c, industry: e.target.value }))} placeholder={t.profile.industryPlaceholder} />
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">{t.profile.defaultLanguage}</label>
                  <select className="input" value={form.defaultLanguage} onChange={(e) => setForm((c) => ({ ...c, defaultLanguage: e.target.value as AppLanguage }))}>
                    <option value="en">EN</option>
                    <option value="zh-CN">中文</option>
                    <option value="ms">BM</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t.profile.defaultTone}</label>
                  <select className="input" value={form.defaultTone} onChange={(e) => setForm((c) => ({ ...c, defaultTone: e.target.value as AiTone }))}>
                    {getToneOptions(t).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t.profile.defaultConversationMode}</label>
                  <select className="input" value={form.defaultConversationMode} onChange={(e) => setForm((c) => ({ ...c, defaultConversationMode: e.target.value as ConversationMode }))}>
                    {getConversationModeOptions(t).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t.profile.defaultEmojiDensity}</label>
                  <select className="input" value={form.defaultEmojiDensity} onChange={(e) => setForm((c) => ({ ...c, defaultEmojiDensity: e.target.value as EmojiDensity }))}>
                    {getEmojiOptions(t).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t.profile.defaultOutputFormat}</label>
                  <select className="input" value={form.defaultOutputFormat} onChange={(e) => setForm((c) => ({ ...c, defaultOutputFormat: e.target.value as OutputFormat }))}>
                    {getOutputFormatOptions(t).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t.profile.defaultFollowUpDays}</label>
                  <input className="input" type="number" min={0} max={30} value={form.defaultFollowUpDays} onChange={(e) => setForm((c) => ({ ...c, defaultFollowUpDays: Number(e.target.value) || 0 }))} />
                </div>
              </>
            )}
          </section>
        )}

        {tab === 'notifications' && (
          <section className="card">
            <div className="section-heading"><h3>{t.profile.notificationsTitle}</h3></div>
            <label className="simple-list-item settings-clickable-item">
              <div>
                <strong>{t.profile.notifyNewInbound}</strong>
                <p>{t.profile.notifyNewInboundHint}</p>
              </div>
              <input type="checkbox" checked={form.notifyNewInbound} onChange={(e) => setForm((c) => ({ ...c, notifyNewInbound: e.target.checked }))} />
            </label>
            <label className="simple-list-item settings-clickable-item">
              <div>
                <strong>{t.profile.notifyReminderDue}</strong>
                <p>{t.profile.notifyReminderDueHint}</p>
              </div>
              <input type="checkbox" checked={form.notifyReminderDue} onChange={(e) => setForm((c) => ({ ...c, notifyReminderDue: e.target.checked }))} />
            </label>
            <div className="form-group">
              <label className="form-label">{t.profile.notifyDailyDigestHour}</label>
              <input className="input" type="number" min={0} max={23} value={form.notifyDailyDigestHour} onChange={(e) => setForm((c) => ({ ...c, notifyDailyDigestHour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) }))} />
            </div>
          </section>
        )}

        {tab === 'security' && (
          <section className="card">
            <div className="section-heading"><h3>{t.profile.securityTitle}</h3></div>
            <div className="simple-list">
              <div className="simple-list-item"><div><strong>{t.profile.securityLastLogin}</strong><p>{securityInfo.lastLoginAt}</p></div></div>
              <div className="simple-list-item"><div><strong>{t.profile.securityLastPasswordChange}</strong><p>{securityInfo.lastPasswordAt}</p></div></div>
            </div>
          </section>
        )}

        <div className="profile-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t.common.loading : t.common.save}</button>
        </div>
      </form>
    </div>
  );
};

export default Settings;
