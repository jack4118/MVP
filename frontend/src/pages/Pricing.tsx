import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLogo from '../components/AppLogo';
import PublicHeader from '../components/PublicHeader';
import { UsageInfo, usageApi } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { storage } from '../utils/storage';
import { useAuth } from '../hooks/useAuth';

const Pricing = () => {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);

  useEffect(() => {
    if (storage.getToken()) {
      loadUsage();
    }
  }, []);

  const loadUsage = async () => {
    try {
      const response = await usageApi.getUsage();
      if (response.success && response.data) {
        setUsageInfo(response.data);
      }
    } catch (_err) {
      // Optional surface
    }
  };

  const currentPlan = usageInfo?.plan === 'pro' ? 'pro' : 'starter';

  const plans = [
    {
      id: 'starter',
      name: t.pricing.starterPlan,
      price: 'RM29',
      description: t.pricing.starterDescription,
      bestFor: t.pricing.bestForStarter,
      features: t.pricing.starterFeatures,
      highlight: false,
      muted: false,
    },
    {
      id: 'pro',
      name: t.pricing.proPlan,
      price: 'RM49',
      description: t.pricing.proDescription,
      bestFor: t.pricing.bestForPro,
      features: t.pricing.proFeatures,
      highlight: true,
      muted: false,
    },
    {
      id: 'business',
      name: t.pricing.businessPlan,
      price: 'RM79',
      description: t.pricing.businessDescription,
      bestFor: t.pricing.bestForBusiness,
      features: t.pricing.businessFeatures,
      highlight: false,
      muted: true,
    },
  ];

  return (
    <div className="page-container">
      <PublicHeader secondaryHref="/agent" secondaryLabel={t.agent.title} />
      <div className="page-section-header">
        <AppLogo compact />
        <h1 className="page-title">{t.pricing.pricing}</h1>
      </div>

      <section className="pricing-hero card">
        <p className="eyebrow">{t.pricing.heroTitle}</p>
        <h2>{t.pricing.publicHeroTitle}</h2>
        <p>{t.pricing.publicHeroBody}</p>
        <p className="page-subtitle">{t.pricing.publicHeroFootnote}</p>
      </section>

      <section className="pricing-grid">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className={`pricing-card ${plan.highlight ? 'pricing-card-highlight' : ''} ${plan.muted ? 'pricing-card-muted' : ''}`}
          >
            <div className="pricing-card-top">
              <div>
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
              </div>
              {plan.highlight && <span className="plan-pill">{t.pricing.recommended}</span>}
              {plan.id === currentPlan && <span className="plan-pill plan-pill-current">{t.pricing.currentPlan}</span>}
              {plan.id === 'business' && <span className="plan-pill plan-pill-muted">{t.pricing.comingSoon}</span>}
            </div>
            <div className="pricing-price">
              <strong>{plan.price}</strong>
              <span>{t.pricing.monthlySuffix}</span>
            </div>
            <div className="pricing-best-for">
              <span>{t.pricing.bestForLabel}</span>
              <strong>{plan.bestFor}</strong>
            </div>
            <ul className="pricing-feature-list">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            {plan.id === 'business' ? (
              <button className="btn btn-secondary" disabled>
                {t.pricing.unavailable}
              </button>
            ) : (
              <Link to={isAuthenticated ? '/dashboard' : '/login'} className={`btn ${plan.highlight ? 'btn-primary' : 'btn-secondary'}`}>
                {plan.id === 'pro' ? t.pricing.upgradeNow : t.common.startFreeTrial}
              </Link>
            )}
          </article>
        ))}
      </section>

      <section className="card pricing-note-card">
        <p>{t.pricing.businessNote}</p>
        <Link to="/agent" className="btn btn-secondary">
          {t.pricing.agentCta}
        </Link>
      </section>
    </div>
  );
};

export default Pricing;
