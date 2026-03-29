import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../hooks/useAuth';
import LanguageToggle from '../components/LanguageToggle';
import ThemeToggle from '../components/ThemeToggle';
import AppLogo from '../components/AppLogo';
import '../styles/landing-v2.css';

const Pricing = () => {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isAppEmbedded = location.pathname.startsWith('/app/');
  const trialTarget = isAuthenticated ? '/dashboard' : '/login';
  const demoTarget = isAuthenticated ? '/whatsapp' : '/login?redirect=/whatsapp';

  return (
    <div className="landing-v2">
      {!isAppEmbedded ? (
        <header className="landing-v2-header">
          <div className="landing-v2-header-inner">
            <Link to="/" className="landing-v2-brand" aria-label={t.landingV2.brandAriaLabel}>
              <AppLogo />
            </Link>

            <nav className="landing-v2-nav" aria-label={t.landingV2.navAriaLabel}>
              <Link to="/#how-it-works">{t.landingV2.navHowItWorks}</Link>
              <Link to="/#solutions">{t.landingV2.navSolutions}</Link>
              <a href="#pricing-plans">{t.landingV2.navPricing}</a>
              <Link to="/#success">{t.landingV2.navSuccess}</Link>
            </nav>

            <div className="landing-v2-header-controls">
              <div className="landing-v2-toggle-row">
                <LanguageToggle />
                <ThemeToggle />
              </div>
              <Link to="/login" className="landing-v2-link-btn">{t.landingV2.navLogin}</Link>
              <Link to={trialTarget} className="landing-v2-btn landing-v2-btn-primary">{t.landingV2.navStartTrial}</Link>
            </div>

            <div className="landing-v2-mobile-actions">
              <Link to={trialTarget} className="landing-v2-btn landing-v2-btn-primary">{t.landingV2.navStartTrial}</Link>
              <button
                type="button"
                className="landing-v2-mobile-menu-btn"
                aria-expanded={mobileMenuOpen}
                aria-controls="pricing-v2-mobile-menu"
                aria-label={t.landingV2.navMenu}
                onClick={() => setMobileMenuOpen((prev) => !prev)}
              >
                ☰
              </button>
            </div>
          </div>
        </header>
      ) : null}
      {!isAppEmbedded && mobileMenuOpen ? (
        <>
          <button
            type="button"
            className="landing-v2-mobile-backdrop"
            aria-label={t.common.close}
            onClick={() => setMobileMenuOpen(false)}
          />
          <div id="pricing-v2-mobile-menu" className="landing-v2-mobile-menu" role="dialog" aria-modal="true">
            <div className="landing-v2-mobile-tools">
              <LanguageToggle />
              <ThemeToggle />
            </div>
            <nav className="landing-v2-mobile-nav" aria-label={t.landingV2.navAriaLabel}>
              <Link to="/#how-it-works" onClick={() => setMobileMenuOpen(false)}>{t.landingV2.navHowItWorks}</Link>
              <Link to="/#solutions" onClick={() => setMobileMenuOpen(false)}>{t.landingV2.navSolutions}</Link>
              <a href="#pricing-plans" onClick={() => setMobileMenuOpen(false)}>{t.landingV2.navPricing}</a>
              <Link to="/#success" onClick={() => setMobileMenuOpen(false)}>{t.landingV2.navSuccess}</Link>
              <Link to="/login" onClick={() => setMobileMenuOpen(false)}>{t.landingV2.navLogin}</Link>
            </nav>
          </div>
        </>
      ) : null}

      <main className="landing-v2-main">
        <section className="landing-v2-section landing-v2-pricing-hero">
          <p className="landing-v2-eyebrow">{t.landingV2.pricingEyebrow}</p>
          <h1 className="landing-v2-pricing-title">{t.landingV2.pricingPageTitle}</h1>
          <p className="landing-v2-subcopy">{t.landingV2.pricingPageSubtitle}</p>
        </section>

        <section id="pricing-plans" className="landing-v2-section landing-v2-pricing">
          <h2>{t.landingV2.pricingTitle}</h2>
          <p className="landing-v2-subcopy">{t.landingV2.pricingSubtitle}</p>
          <div className="landing-v2-pricing-grid">
            <article className="landing-v2-pricing-card">
              <h3>{t.landingV2.pricingStarterName}</h3>
              <strong>{t.landingV2.pricingStarterPrice}</strong>
              <span>{t.landingV2.pricingPerMonth}</span>
              <p>{t.landingV2.pricingStarterBody}</p>
              <ul className="landing-v2-pricing-list">
                <li>{t.landingV2.pricingStarterFeature1}</li>
                <li>{t.landingV2.pricingStarterFeature2}</li>
                <li>{t.landingV2.pricingStarterFeature3}</li>
              </ul>
              <Link to={trialTarget} className="landing-v2-btn landing-v2-btn-secondary">{t.landingV2.pricingTrialCta}</Link>
            </article>

            <article className="landing-v2-pricing-card landing-v2-pricing-card-highlight">
              <p className="landing-v2-pricing-pill">{t.landingV2.pricingMostPopular}</p>
              <h3>{t.landingV2.pricingGrowthName}</h3>
              <strong>{t.landingV2.pricingGrowthPrice}</strong>
              <span>{t.landingV2.pricingPerMonth}</span>
              <p>{t.landingV2.pricingGrowthBody}</p>
              <ul className="landing-v2-pricing-list">
                <li>{t.landingV2.pricingGrowthFeature1}</li>
                <li>{t.landingV2.pricingGrowthFeature2}</li>
                <li>{t.landingV2.pricingGrowthFeature3}</li>
              </ul>
              <Link to={trialTarget} className="landing-v2-btn landing-v2-btn-secondary">{t.landingV2.pricingTrialCta}</Link>
            </article>

            <article className="landing-v2-pricing-card">
              <h3>{t.landingV2.pricingProName}</h3>
              <strong>{t.landingV2.pricingProPrice}</strong>
              <span>{t.landingV2.pricingPerMonth}</span>
              <p>{t.landingV2.pricingProBody}</p>
              <ul className="landing-v2-pricing-list">
                <li>{t.landingV2.pricingProFeature1}</li>
                <li>{t.landingV2.pricingProFeature2}</li>
                <li>{t.landingV2.pricingProFeature3}</li>
              </ul>
              <Link to={trialTarget} className="landing-v2-btn landing-v2-btn-secondary">{t.landingV2.pricingTrialCta}</Link>
            </article>
          </div>
        </section>

        <section className="landing-v2-final-cta">
          <h2>{t.landingV2.pricingFinalTitle}</h2>
          <p>{t.landingV2.pricingFinalSubtitle}</p>
          <div className="landing-v2-hero-actions">
            <Link to={trialTarget} className="landing-v2-btn landing-v2-btn-primary">{t.landingV2.finalPrimaryCta}</Link>
            <Link to={demoTarget} className="landing-v2-btn landing-v2-btn-secondary">{t.landingV2.finalSecondaryCta}</Link>
          </div>
        </section>
      </main>

      {!isAppEmbedded ? (
        <footer className="landing-v2-footer">
          <div className="landing-v2-footer-grid">
            <div>
              <h3>{t.landingV2.footerBrand}</h3>
              <p>{t.landingV2.footerBrandBody}</p>
            </div>
            <div>
              <h4>{t.landingV2.footerProductTitle}</h4>
              <nav>
                <Link to="/whatsapp">{t.landingV2.footerProductWhatsApp}</Link>
                <Link to="/leads">{t.landingV2.footerProductLeads}</Link>
                <Link to="/reminders">{t.landingV2.footerProductReminders}</Link>
                <Link to="/ai">{t.landingV2.footerProductAi}</Link>
              </nav>
            </div>
            <div>
              <h4>{t.landingV2.footerCompanyTitle}</h4>
              <nav>
                <Link to="/pricing">{t.landingV2.footerCompanyPricing}</Link>
                <Link to="/login">{t.landingV2.footerCompanyLogin}</Link>
              </nav>
            </div>
            <div>
              <h4>{t.landingV2.footerSupportTitle}</h4>
              <nav>
                <Link to="/pricing">{t.landingV2.footerSupportPricing}</Link>
                <Link to={demoTarget}>{t.landingV2.footerSupportDemo}</Link>
              </nav>
            </div>
          </div>
          <p className="landing-v2-footer-note">{t.landingV2.footerNote}</p>
        </footer>
      ) : null}
    </div>
  );
};

export default Pricing;
