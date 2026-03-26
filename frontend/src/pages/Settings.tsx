import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthenticatedHeader from '../components/AuthenticatedHeader';
import {
  getConversationModeOptions,
  getOutputFormatOptions,
} from '../features/ai/shared';
import { useAuth } from '../hooks/useAuth';
import {
  AiTone,
  AppLanguage,
  BaseStyleTone,
  ConversationMode,
  EmojiDensity,
  HeadersListsLevel,
  OutputFormat,
  PersonalizationLevel,
  getApiErrorMessage,
} from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

type SettingsTab = 'profile' | 'ai' | 'notifications' | 'security';

const mapLegacyToneToBaseStyle = (tone?: string | null): BaseStyleTone => {
  if (!tone) return 'default';
  if (tone === 'professional') return 'professional';
  if (tone === 'friendly' || tone === 'casual' || tone === 'empathetic') return 'friendly';
  if (tone === 'assertive' || tone === 'urgent') return 'concise';
  return 'default';
};

const mapBaseStyleToLegacyTone = (baseStyle: BaseStyleTone) => {
  if (baseStyle === 'professional') return 'professional';
  if (baseStyle === 'friendly') return 'friendly';
  if (baseStyle === 'concise') return 'assertive';
  return 'polite';
};

const mapLegacyEmojiToCharacter = (emoji?: string | null): PersonalizationLevel => {
  if (emoji === 'low' || emoji === 'medium' || emoji === 'high') return emoji;
  return 'default';
};

const mapCharacterEmojiToLegacy = (value: PersonalizationLevel) => {
  if (value === 'low' || value === 'high') return value;
  return 'medium';
};

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
    baseStyleTone: 'default' as BaseStyleTone,
    characterWarmth: 'default' as PersonalizationLevel,
    characterEnthusiasm: 'default' as PersonalizationLevel,
    characterHeadersLists: 'default' as HeadersListsLevel,
    characterEmoji: 'default' as PersonalizationLevel,
    customInstructions: '',
    nickname: '',
    occupation: '',
    aboutYou: '',
    memoryEnabled: true,
    recordHistoryEnabled: true,
    defaultConversationMode: 'standard' as ConversationMode,
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
      baseStyleTone: user.baseStyleTone || mapLegacyToneToBaseStyle(user.defaultTone),
      characterWarmth: user.characterWarmth || 'default',
      characterEnthusiasm: user.characterEnthusiasm || 'default',
      characterHeadersLists: user.characterHeadersLists || 'default',
      characterEmoji: user.characterEmoji || mapLegacyEmojiToCharacter(user.defaultEmojiDensity),
      customInstructions: user.customInstructions || '',
      nickname: user.nickname || '',
      occupation: user.occupation || '',
      aboutYou: user.aboutYou || '',
      memoryEnabled: user.memoryEnabled ?? true,
      recordHistoryEnabled: user.recordHistoryEnabled ?? true,
      defaultConversationMode: user.defaultConversationMode || 'standard',
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
        baseStyleTone: form.baseStyleTone,
        characterWarmth: form.characterWarmth,
        characterEnthusiasm: form.characterEnthusiasm,
        characterHeadersLists: form.characterHeadersLists,
        characterEmoji: form.characterEmoji,
        customInstructions: form.customInstructions.trim() || null,
        nickname: form.nickname.trim() || null,
        occupation: form.occupation.trim() || null,
        aboutYou: form.aboutYou.trim() || null,
        memoryEnabled: form.memoryEnabled,
        recordHistoryEnabled: form.recordHistoryEnabled,
        defaultTone: mapBaseStyleToLegacyTone(form.baseStyleTone) as AiTone,
        defaultEmojiDensity: mapCharacterEmojiToLegacy(form.characterEmoji) as EmojiDensity,
        defaultConversationMode: form.defaultConversationMode,
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
        {tab === 'profile' && (
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
            <div className="form-group">
              <label className="form-label">{t.profile.defaultLanguage}</label>
              <select className="input" value={form.defaultLanguage} onChange={(e) => setForm((c) => ({ ...c, defaultLanguage: e.target.value as AppLanguage }))}>
                <option value="en">EN</option>
                <option value="zh-CN">中文</option>
                <option value="ms">BM</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t.profile.defaultCountryCode}</label>
              <input className="input" value={form.defaultCountryCode} onChange={(e) => setForm((c) => ({ ...c, defaultCountryCode: e.target.value }))} />
            </div>
          </section>
        )}

        {tab === 'ai' && (
          <>
            <section className="card">
              <div className="section-heading"><h3>{t.profile.personalizationTitle}</h3></div>

              <div className="form-group">
                <label className="form-label">{t.profile.baseStyleToneLabel}</label>
                <select className="input" value={form.baseStyleTone} onChange={(e) => setForm((c) => ({ ...c, baseStyleTone: e.target.value as BaseStyleTone }))}>
                  <option value="default">{t.profile.levelDefault}</option>
                  <option value="professional">{t.profile.baseStyleProfessional}</option>
                  <option value="friendly">{t.profile.baseStyleFriendly}</option>
                  <option value="concise">{t.profile.baseStyleConcise}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t.profile.characterWarmth}</label>
                <select className="input" value={form.characterWarmth} onChange={(e) => setForm((c) => ({ ...c, characterWarmth: e.target.value as PersonalizationLevel }))}>
                  <option value="default">{t.profile.levelDefault}</option>
                  <option value="low">{t.profile.levelLow}</option>
                  <option value="medium">{t.profile.levelMedium}</option>
                  <option value="high">{t.profile.levelHigh}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t.profile.characterEnthusiasm}</label>
                <select className="input" value={form.characterEnthusiasm} onChange={(e) => setForm((c) => ({ ...c, characterEnthusiasm: e.target.value as PersonalizationLevel }))}>
                  <option value="default">{t.profile.levelDefault}</option>
                  <option value="low">{t.profile.levelLow}</option>
                  <option value="medium">{t.profile.levelMedium}</option>
                  <option value="high">{t.profile.levelHigh}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t.profile.characterHeadersLists}</label>
                <select className="input" value={form.characterHeadersLists} onChange={(e) => setForm((c) => ({ ...c, characterHeadersLists: e.target.value as HeadersListsLevel }))}>
                  <option value="default">{t.profile.levelDefault}</option>
                  <option value="minimal">{t.profile.headersMinimal}</option>
                  <option value="structured">{t.profile.headersStructured}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t.profile.characterEmoji}</label>
                <select className="input" value={form.characterEmoji} onChange={(e) => setForm((c) => ({ ...c, characterEmoji: e.target.value as PersonalizationLevel }))}>
                  <option value="default">{t.profile.levelDefault}</option>
                  <option value="low">{t.profile.levelLow}</option>
                  <option value="medium">{t.profile.levelMedium}</option>
                  <option value="high">{t.profile.levelHigh}</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t.profile.customInstructions}</label>
                <textarea className="input" rows={4} value={form.customInstructions} onChange={(e) => setForm((c) => ({ ...c, customInstructions: e.target.value }))} placeholder={t.profile.customInstructionsPlaceholder} />
              </div>
            </section>

            <section className="card">
              <div className="section-heading"><h3>{t.profile.aboutYouTitle}</h3></div>
              <div className="form-group">
                <label className="form-label">{t.profile.nickname}</label>
                <input className="input" value={form.nickname} onChange={(e) => setForm((c) => ({ ...c, nickname: e.target.value }))} placeholder={t.profile.nicknamePlaceholder} />
              </div>
              <div className="form-group">
                <label className="form-label">{t.profile.occupation}</label>
                <input className="input" value={form.occupation} onChange={(e) => setForm((c) => ({ ...c, occupation: e.target.value }))} placeholder={t.profile.occupationPlaceholder} />
              </div>
              <div className="form-group">
                <label className="form-label">{t.profile.moreAboutYou}</label>
                <textarea className="input" rows={3} value={form.aboutYou} onChange={(e) => setForm((c) => ({ ...c, aboutYou: e.target.value }))} placeholder={t.profile.moreAboutYouPlaceholder} />
              </div>
            </section>

            <section className="card">
              <div className="section-heading"><h3>{t.profile.memoryTitle}</h3></div>
              <label className="simple-list-item settings-clickable-item">
                <div>
                  <strong>{t.profile.memoryEnabledLabel}</strong>
                  <p>{t.profile.memoryEnabledHint}</p>
                </div>
                <input type="checkbox" checked={form.memoryEnabled} onChange={(e) => setForm((c) => ({ ...c, memoryEnabled: e.target.checked }))} />
              </label>
              <label className="simple-list-item settings-clickable-item">
                <div>
                  <strong>{t.profile.recordHistoryEnabledLabel}</strong>
                  <p>{t.profile.recordHistoryEnabledHint}</p>
                </div>
                <input type="checkbox" checked={form.recordHistoryEnabled} onChange={(e) => setForm((c) => ({ ...c, recordHistoryEnabled: e.target.checked }))} />
              </label>
            </section>

            <section className="card">
              <div className="section-heading"><h3>{t.profile.aiDefaultsTitle}</h3></div>
              <div className="form-group">
                <label className="form-label">{t.profile.defaultConversationMode}</label>
                <select className="input" value={form.defaultConversationMode} onChange={(e) => setForm((c) => ({ ...c, defaultConversationMode: e.target.value as ConversationMode }))}>
                  {getConversationModeOptions(t).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
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
            </section>
          </>
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
