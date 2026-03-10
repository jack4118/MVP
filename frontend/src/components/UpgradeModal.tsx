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

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: '500px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2>{t.pricing.upgradeModalTitle}</h2>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '6px 12px' }}
          >
            {t.common.close}
          </button>
        </div>

        <p style={{ marginBottom: '8px', color: 'var(--text-secondary)' }}>
          {t.pricing.upgradeModalDescription}
        </p>
        <p style={{ marginBottom: '24px', color: 'var(--text-secondary)', fontWeight: 600 }}>
          {translate(t.pricing.valueMessagesCreated, { count: generatedCount })}
        </p>

        <div className="upgrade-plan-grid">
          <div className="upgrade-plan-card">
            <div className="upgrade-plan-label">{t.pricing.upgradeModalStarterLabel}</div>
            <div className="upgrade-plan-price">RM29{t.pricing.monthlySuffix}</div>
            <p>{t.pricing.starterDescription}</p>
          </div>
          <div className="upgrade-plan-card upgrade-plan-card-highlight">
            <div className="upgrade-plan-label">{t.pricing.proPlan}</div>
            <div className="upgrade-plan-price">RM49{t.pricing.monthlySuffix}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0 0' }}>
              <li style={{ padding: '6px 0' }}>✓ {t.pricing.unlimitedLeads}</li>
              <li style={{ padding: '6px 0' }}>✓ {t.pricing.unlimitedAi}</li>
              <li style={{ padding: '6px 0' }}>✓ {t.pricing.oneClickCopy}</li>
              <li style={{ padding: '6px 0' }}>✓ {t.pricing.futureFeatures}</li>
            </ul>
          </div>
          <div className="upgrade-plan-card upgrade-plan-card-muted">
            <div className="upgrade-plan-label">{t.pricing.upgradeModalBusinessLabel}</div>
            <div className="upgrade-plan-price">RM79{t.pricing.monthlySuffix}</div>
            <p>{t.pricing.businessDescription}</p>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            disabled={loading}
          >
            {t.common.cancel}
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
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', marginRight: '8px' }}></div>
                {t.common.loading}
              </>
            ) : (
              t.pricing.upgradeNow
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
