import { useEffect, useState } from 'react';
import { useLanguage, translate } from '../contexts/LanguageContext';
import { usageApi } from '../services/api';
import { trackProductEvent } from '../utils/analytics';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradeSuccess?: () => void;
  source?: 'copy_gate' | 'ai_limit' | 'post_success' | 'generic';
  generatedCount?: number;
}

const UpgradeModal = ({
  isOpen,
  onClose,
  onUpgradeSuccess,
  source = 'generic',
  generatedCount = 0,
}: UpgradeModalProps) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    trackProductEvent('upgrade_modal_opened', { source });
  }, [isOpen, source]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="upgrade-modal-shell"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card upgrade-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
      >
        <div className="upgrade-modal-header">
          <h2 id="upgrade-modal-title">{t.pricing.upgradeModalTitle}</h2>
          <button
            onClick={onClose}
            className="upgrade-modal-close"
            aria-label={t.common.close}
          >
            ×
          </button>
        </div>

        <p className="upgrade-modal-intro">
          {t.pricing.upgradeModalDescription}
        </p>
        <ul className="upgrade-modal-outcomes">
          <li>{t.pricing.upgradeModalOutcome1}</li>
          <li>{t.pricing.upgradeModalOutcome2}</li>
          <li>{t.pricing.upgradeModalOutcome3}</li>
        </ul>
        <p className="upgrade-modal-generated-count">{translate(t.pricing.valueMessagesCreated, { count: generatedCount })}</p>

        <div className="upgrade-plan-scroll">
          <div className="upgrade-plan-grid">
            <article className="upgrade-plan-card" tabIndex={0}>
              <div className="upgrade-plan-label">{t.pricing.upgradeModalStarterLabel}</div>
              <div className="upgrade-plan-price" aria-label={`RM29 ${t.pricing.perMonthLabel}`}>
                <strong>RM29</strong>
                <span>{t.pricing.perMonthLabel}</span>
              </div>
              <p>{t.pricing.starterDescription}</p>
            </article>
            <article className="upgrade-plan-card upgrade-plan-card-highlight" tabIndex={0}>
              <div className="upgrade-plan-label">{t.pricing.proPlan}</div>
              <div className="upgrade-plan-price" aria-label={`RM49 ${t.pricing.perMonthLabel}`}>
                <strong>RM49</strong>
                <span>{t.pricing.perMonthLabel}</span>
              </div>
              <ul className="upgrade-plan-feature-list">
                <li>✓ {t.pricing.unlimitedLeads}</li>
                <li>✓ {t.pricing.unlimitedAi}</li>
                <li>✓ {t.pricing.oneClickCopy}</li>
                <li>✓ {t.pricing.futureFeatures}</li>
              </ul>
            </article>
            <article className="upgrade-plan-card upgrade-plan-card-muted" tabIndex={0}>
              <div className="upgrade-plan-label">{t.pricing.upgradeModalBusinessLabel}</div>
              <div className="upgrade-plan-price" aria-label={`RM79 ${t.pricing.perMonthLabel}`}>
                <strong>RM79</strong>
                <span>{t.pricing.perMonthLabel}</span>
              </div>
              <p>{t.pricing.businessDescription}</p>
            </article>
          </div>
        </div>

        {error && (
          <div className="alert alert-error upgrade-modal-error">
            <span>{error}</span>
          </div>
        )}

        <div className="upgrade-modal-actions">
          <button
            onClick={onClose}
            className="btn btn-secondary"
            disabled={loading}
          >
            {t.pricing.notNow}
          </button>
          <button
            onClick={async () => {
              setLoading(true);
              setError('');
              try {
                const response = await usageApi.upgradeToPro();
                if (response.success) {
                  trackProductEvent('upgrade_confirmed', { source });
                  onClose();
                  if (onUpgradeSuccess) {
                    onUpgradeSuccess();
                  }
                  // Refresh the page to update usage info
                  window.location.reload();
                } else {
                  setError(response.error?.message || t.common.error);
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : t.common.error);
              } finally {
                setLoading(false);
              }
            }}
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? (
              <>
                <div className="spinner upgrade-modal-spinner"></div>
                {t.common.loading}
              </>
            ) : (
              t.pricing.upgradeToPro
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
