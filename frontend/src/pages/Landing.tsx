import { Link } from 'react-router-dom';
import AppLogo from '../components/AppLogo';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import { useLanguage } from '../contexts/LanguageContext';

const Landing = () => {
  const { t } = useLanguage();

  return (
    <div className="landing-shell">
      <header className="landing-header">
        <AppLogo />
        <div className="header-actions">
          <Link to="/pricing" className="btn btn-secondary">
            {t.pricing.pricing}
          </Link>
          <Link to="/agent" className="btn btn-secondary">
            {t.agent.waitlistTitle}
          </Link>
          <LanguageToggle />
          <ThemeToggle />
          <Link to="/login" className="btn btn-primary">
            {t.common.startFreeTrial}
          </Link>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero card">
          <p className="eyebrow">{t.landing.eyebrow}</p>
          <h1>{t.landing.heroTitle}</h1>
          <p className="landing-subtitle">{t.landing.heroSubtitle}</p>
          <div className="landing-cta-row">
            <Link to="/login" className="btn btn-primary">
              {t.common.startFreeTrial}
            </Link>
            <Link to="/pricing" className="btn btn-secondary">
              {t.landing.seePricing}
            </Link>
          </div>
        </section>

        <section className="landing-proof-grid">
          <article className="card">
            <h3>{t.landing.sellTitle}</h3>
            <p>{t.landing.sellBody}</p>
          </article>
          <article className="card">
            <h3>{t.landing.audienceTitle}</h3>
            <p>{t.landing.audienceBody}</p>
          </article>
          <article className="card">
            <h3>{t.landing.dailyTitle}</h3>
            <p>{t.landing.dailyBody}</p>
          </article>
        </section>

        <section className="landing-flow card">
          <p className="eyebrow">{t.landing.workflowEyebrow}</p>
          <h2>{t.landing.workflowTitle}</h2>
          <div className="landing-steps">
            <div>
              <strong>{t.landing.step1Title}</strong>
              <span>{t.landing.step1Body}</span>
            </div>
            <div>
              <strong>{t.landing.step2Title}</strong>
              <span>{t.landing.step2Body}</span>
            </div>
            <div>
              <strong>{t.landing.step3Title}</strong>
              <span>{t.landing.step3Body}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Landing;
