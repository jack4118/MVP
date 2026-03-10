import { translate, useLanguage } from '../contexts/LanguageContext';
import { UsageInfo } from '../services/api';

interface AiUsageCardProps {
  usageInfo: UsageInfo | null;
  compact?: boolean;
  onUpgrade?: () => void;
}

const AiUsageCard = ({ usageInfo, compact = false, onUpgrade }: AiUsageCardProps) => {
  const { t } = useLanguage();

  if (!usageInfo || usageInfo.plan !== 'free') {
    return null;
  }

  return (
    <div className={`usage-card ${compact ? 'usage-card-compact' : ''}`}>
      <div className="usage-card-copy">
        <strong>
          {usageInfo.aiLimit !== null
            ? translate(t.pricing.aiMessagesLeft, { count: usageInfo.aiRemaining ?? 0 })
            : t.pricing.aiMessagesLeftUnlimited}
        </strong>
        {usageInfo.aiLimit !== null && (
          <>
            <span>{translate(t.pricing.usageProgress, { used: usageInfo.aiUsageThisMonth, limit: usageInfo.aiLimit })}</span>
            <div className="usage-progress">
              <div className="usage-progress-bar" style={{ width: `${usageInfo.aiUsagePercent}%` }} />
            </div>
          </>
        )}
      </div>
      {onUpgrade && (
        <button className="btn btn-secondary" onClick={onUpgrade}>
          {t.pricing.upgradeNow}
        </button>
      )}
    </div>
  );
};

export default AiUsageCard;
