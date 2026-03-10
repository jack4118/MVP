import { useLanguage } from '../contexts/LanguageContext';
import {
  AiPurpose,
  SharedAiConfig,
  aiPresetsEnabled,
  getConversationModeOptions,
  getEmojiOptions,
  getFollowUpPresetOptions,
  getOutputFormatOptions,
  getPaymentPresetOptions,
  getPurposeOptions,
  getToneOptions,
} from '../features/ai/shared';
import {
  ConversationMode,
  EmojiDensity,
  FollowUpStylePreset,
  OutputFormat,
  PaymentStylePreset,
} from '../services/api';

interface AiComposerFieldsProps {
  config: SharedAiConfig;
  onChange: (patch: Partial<SharedAiConfig>) => void;
  compact?: boolean;
  advancedOpen?: boolean;
  onToggleAdvanced?: () => void;
}

const AiComposerFields = ({
  config,
  onChange,
  compact = false,
  advancedOpen = true,
  onToggleAdvanced,
}: AiComposerFieldsProps) => {
  const { t } = useLanguage();
  const showAdvanced = compact ? advancedOpen : true;

  return (
    <>
      <div className="form-group">
        <label className="form-label">{t.ai.purpose} *</label>
        <select
          value={config.purpose}
          onChange={(e) => onChange({ purpose: e.target.value as AiPurpose })}
          className="input"
        >
          {getPurposeOptions(t).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">{t.ai.objective} *</label>
        <textarea
          value={config.objective}
          onChange={(e) => onChange({ objective: e.target.value })}
          className="input"
          rows={compact ? 3 : 4}
          placeholder={t.ai.objectivePlaceholder}
        />
      </div>

      <div className="form-group">
        <label className="form-label">{t.ai.outputFormat}</label>
        <select
          value={config.outputFormat}
          onChange={(e) => onChange({ outputFormat: e.target.value as OutputFormat })}
          className="input"
        >
          {getOutputFormatOptions(t).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {compact && onToggleAdvanced && (
        <button type="button" className="quick-ai-advanced-toggle" onClick={onToggleAdvanced}>
          {advancedOpen ? t.ai.hideAdvanced : t.ai.showAdvanced}
        </button>
      )}

      {showAdvanced && (
        <div className={`ai-fields-grid ${compact ? 'ai-fields-grid-compact' : ''}`}>
          {config.purpose === 'follow-up' ? (
            <div className="form-group">
              <label className="form-label">{t.ai.daysPassed}</label>
              <input
                type="number"
                min="0"
                value={config.daysPassed}
                onChange={(e) => onChange({ daysPassed: parseInt(e.target.value, 10) || 0 })}
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
                  min="0"
                  step="0.01"
                  value={config.amount}
                  onChange={(e) => onChange({ amount: parseFloat(e.target.value) || 0 })}
                  className="input"
                  placeholder={t.ai.amountPlaceholder}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.ai.dueDate}</label>
                <input
                  type="date"
                  value={config.dueDate}
                  onChange={(e) => onChange({ dueDate: e.target.value })}
                  className="input"
                />
              </div>
            </>
          )}

          {aiPresetsEnabled && (
            <div className="form-group">
              <label className="form-label">{t.ai.stylePreset}</label>
              <select
                value={config.purpose === 'follow-up' ? config.followUpStylePreset : config.paymentStylePreset}
                onChange={(e) =>
                  onChange(
                    config.purpose === 'follow-up'
                      ? { followUpStylePreset: e.target.value as FollowUpStylePreset }
                      : { paymentStylePreset: e.target.value as PaymentStylePreset }
                  )
                }
                className="input"
              >
                {(config.purpose === 'follow-up' ? getFollowUpPresetOptions(t) : getPaymentPresetOptions(t)).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">{t.ai.tone}</label>
            <select value={config.tone} onChange={(e) => onChange({ tone: e.target.value as SharedAiConfig['tone'] })} className="input">
              {getToneOptions(t).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t.ai.replyMode}</label>
            <select
              value={config.conversationMode}
              onChange={(e) => onChange({ conversationMode: e.target.value as ConversationMode })}
              className="input"
            >
              {getConversationModeOptions(t).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t.ai.emojiLevel}</label>
            <select
              value={config.emojiDensity}
              onChange={(e) => onChange({ emojiDensity: e.target.value as EmojiDensity })}
              className="input"
            >
              {getEmojiOptions(t).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </>
  );
};

export default AiComposerFields;
