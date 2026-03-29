import { useLanguage } from '../contexts/LanguageContext';
import {
  getChannelOptions,
  getEmojiIntensityOptions,
  getStyleOptions,
  SharedAiConfig,
} from '../features/ai/shared';
import { AiStyle, EmojiDensity } from '../services/api';

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
        <label className="form-label">{t.ai.goal} *</label>
        <textarea
          value={config.goal}
          onChange={(e) => onChange({ goal: e.target.value })}
          className="input"
          rows={compact ? 3 : 4}
          placeholder={t.ai.goalPlaceholder}
        />
      </div>

      <div className="ai-fields-grid">
        <div className="form-group">
          <label className="form-label">{t.ai.channel} *</label>
          <select
            value={config.channel}
            onChange={(e) => onChange({ channel: e.target.value as SharedAiConfig['channel'] })}
            className="input"
          >
            {getChannelOptions(t).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{t.ai.style} *</label>
          <select
            value={config.style}
            onChange={(e) => onChange({ style: e.target.value as AiStyle })}
            className="input"
          >
            {getStyleOptions(t).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">{t.ai.context}</label>
        <textarea
          value={config.context}
          onChange={(e) => onChange({ context: e.target.value })}
          className="input"
          rows={compact ? 2 : 3}
          placeholder={t.ai.contextPlaceholder}
        />
      </div>

      {compact && onToggleAdvanced && (
        <button type="button" className="quick-ai-advanced-toggle" onClick={onToggleAdvanced}>
          {advancedOpen ? t.ai.hideAdvanced : t.ai.showAdvanced}
        </button>
      )}

      {showAdvanced && (
        <div className={`ai-fields-grid ${compact ? 'ai-fields-grid-compact' : ''}`}>
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

          <div className="form-group">
            <label className="form-label">{t.ai.emojiLevel}</label>
            <select
              value={config.emojiIntensity}
              onChange={(e) => onChange({ emojiIntensity: e.target.value as EmojiDensity })}
              className="input"
            >
              {getEmojiIntensityOptions(t).map((option) => (
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
