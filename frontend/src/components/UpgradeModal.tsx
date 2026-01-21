import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { usageApi } from '../services/api';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradeSuccess?: () => void;
}

const UpgradeModal = ({ isOpen, onClose, onUpgradeSuccess }: UpgradeModalProps) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

        <p style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
          {t.pricing.upgradeModalDescription}
        </p>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px' }}>{t.pricing.proPlan}</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '8px', fontSize: '18px' }}>✓</span>
              {t.pricing.unlimitedLeads}
            </li>
            <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '8px', fontSize: '18px' }}>✓</span>
              {t.pricing.unlimitedAi}
            </li>
            <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '8px', fontSize: '18px' }}>✓</span>
              {t.pricing.oneClickCopy}
            </li>
            <li style={{ padding: '8px 0', display: 'flex', alignItems: 'center' }}>
              <span style={{ marginRight: '8px', fontSize: '18px' }}>✓</span>
              {t.pricing.futureFeatures}
            </li>
          </ul>
        </div>

        <div style={{ 
          padding: '16px', 
          backgroundColor: 'var(--bg-secondary)', 
          borderRadius: '8px',
          marginBottom: '24px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
            {t.pricing.pricePerMonth}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {t.pricing.pricePerMonthUsd}
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

