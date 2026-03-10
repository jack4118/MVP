import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import AppLogo from '../components/AppLogo';
import { UsageInfo, usageApi } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

const Pricing = () => {
  const { t } = useLanguage();
  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);

  useEffect(() => {
    loadUsage();
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
      <header className="page-header">
        <div className="header-left">
          <Link to="/dashboard" className="home-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </Link>
          <div>
            <AppLogo compact />
            <h1 className="page-title">{t.pricing.pricing}</h1>
          </div>
        </div>
        <div className="header-actions">
          <Link to="/agent" className="btn btn-secondary">
            {t.agent.title}
          </Link>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <section className="pricing-hero card">
        <p className="eyebrow">{t.pricing.heroTitle}</p>
        <h2>{t.pricing.compareTitle}</h2>
        <p>{t.pricing.heroSubtitle}</p>
        <p className="page-subtitle">{t.pricing.compareSubtitle}</p>
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
              <Link to="/ai" className={`btn ${plan.highlight ? 'btn-primary' : 'btn-secondary'}`}>
                {plan.id === 'pro' ? t.pricing.upgradeNow : t.ai.generateText}
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
