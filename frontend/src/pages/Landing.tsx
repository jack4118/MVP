import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../hooks/useAuth';
import PublicHeader from '../components/PublicHeader';
import AppLogo from '../components/AppLogo';

const Landing = () => {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const workflowRef = useRef<HTMLElement | null>(null);
  const [workflowHighlight, setWorkflowHighlight] = useState(false);

  const faqItems = [
    { question: t.landing.faqApiQuestion, answer: t.landing.faqApiAnswer },
    { question: t.landing.faqCrmQuestion, answer: t.landing.faqCrmAnswer },
    { question: t.landing.faqAutoQuestion, answer: t.landing.faqAutoAnswer },
  ];

  const socialProofLabels = [
    t.landing.socialChipProperty,
    t.landing.socialChipInsurance,
    t.landing.socialChipCars,
    t.landing.socialChipFreelancers,
  ];

  const painPoints = [
    t.landing.problemPoint1,
    t.landing.problemPoint2,
    t.landing.problemPoint3,
    t.landing.problemPoint4,
  ];

  const scrollToWorkflow = () => {
    const node = workflowRef.current;
    if (!node) return;

    const header = document.querySelector('.landing-header') as HTMLElement | null;
    const offset = header ? header.offsetHeight + 12 : 12;
    const top = node.getBoundingClientRect().top + window.scrollY - offset;

    window.scrollTo({ top, behavior: 'smooth' });
    window.history.replaceState(null, '', '#how-it-works');
    window.setTimeout(() => {
      node.focus();
      setWorkflowHighlight(true);
      window.setTimeout(() => setWorkflowHighlight(false), 1200);
    }, 260);
  };

  useEffect(() => {
    const onScrollRequest = () => {
      scrollToWorkflow();
    };

    window.addEventListener('ezreply-scroll-workflow', onScrollRequest);
    if (window.location.hash === '#how-it-works' || window.location.hash === '#workflow') {
      window.setTimeout(() => scrollToWorkflow(), 0);
    }

    return () => window.removeEventListener('ezreply-scroll-workflow', onScrollRequest);
  }, []);

  return (
    <div className="landing-shell">
      <PublicHeader />

      <main className="landing-main">
        <section className="landing-hero card landing-hero-surface">
          <div className="landing-hero-grid">
            <div>
              <p className="eyebrow">{t.landing.heroBadge}</p>
              <h1>{t.landing.heroTitle}</h1>
              <p className="landing-subtitle">{t.landing.heroSubtitle}</p>
              <div className="landing-cta-row">
                <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn btn-primary">
                  {t.common.startFreeTrial}
                </Link>
                <button type="button" className="btn btn-secondary" onClick={scrollToWorkflow}>
                  {t.landing.heroSecondaryCta}
                </button>
              </div>
              <p className="landing-outcome">{t.landing.outcomeStatement}</p>
            </div>
            <div className="landing-stat-grid">
              <article className="landing-stat-card">
                <strong>{t.landing.statResponseValue}</strong>
                <span>{t.landing.statResponseLabel}</span>
              </article>
              <article className="landing-stat-card">
                <strong>{t.landing.statCloseRateValue}</strong>
                <span>{t.landing.statCloseRateLabel}</span>
              </article>
              <article className="landing-stat-card">
                <strong>{t.landing.statTimeSavedValue}</strong>
                <span>{t.landing.statTimeSavedLabel}</span>
              </article>
              <article className="landing-stat-card">
                <strong>{t.landing.statRoiValue}</strong>
                <span>{t.landing.statRoiLabel}</span>
              </article>
            </div>
          </div>
          <p className="landing-social-line">{t.landing.socialProofLine}</p>
        </section>

        <section className="card landing-social-proof landing-trust-block">
          <p className="eyebrow">{t.landing.socialEyebrow}</p>
          <h2>{t.landing.socialTitle}</h2>
          <p>{t.landing.socialBody}</p>
          <div className="landing-social-chips">
            {socialProofLabels.map((label) => (
              <span key={label} className="task-pill">
                {label}
              </span>
            ))}
          </div>
          <div className="landing-trust-list">
            <p>{t.landing.trustPoint1}</p>
            <p>{t.landing.trustPoint2}</p>
            <p>{t.landing.trustPoint3}</p>
          </div>
        </section>

        <section className="card landing-problem landing-problem-panel">
          <div className="landing-problem-image-wrap">
            <div className="landing-problem-visual" aria-label={t.landing.problemImageAlt}>
              <div className="landing-problem-chat-bubble">{t.landing.problemQuote1}</div>
              <div className="landing-problem-chat-bubble">{t.landing.problemQuote2}</div>
              <div className="landing-problem-chat-bubble">{t.landing.problemQuote3}</div>
              <strong>{t.landing.problemPunchline}</strong>
            </div>
          </div>
          <div>
            <p className="eyebrow">{t.landing.problemEyebrow}</p>
            <h2>{t.landing.problemTitle}</h2>
            <p className="landing-problem-body">{t.landing.problemBody}</p>
            <div className="landing-problem-list">
              {painPoints.map((item) => (
                <div key={item} className="landing-problem-item">
                  <span>•</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          ref={workflowRef}
          className={`card landing-workflow landing-workflow-panel ${workflowHighlight ? 'landing-workflow-highlight' : ''}`}
          tabIndex={-1}
        >
          <h2>{t.landing.workflowTitle}</h2>
          <div className="landing-workflow-line">{t.landing.workflowLine}</div>
          <p className="landing-workflow-body">{t.landing.workflowBody}</p>
          <div className="landing-step-grid">
            <article className="landing-step-card">
              <h3>{t.landing.solutionStep1}</h3>
            </article>
            <article className="landing-step-card">
              <h3>{t.landing.solutionStep2}</h3>
            </article>
            <article className="landing-step-card">
              <h3>{t.landing.solutionStep3}</h3>
            </article>
            <article className="landing-step-card">
              <h3>{t.landing.solutionStep4}</h3>
            </article>
          </div>
        </section>

        <section className="card landing-brand-panel">
          <p className="eyebrow">{t.landing.brandEyebrow}</p>
          <h2>{t.landing.brandTitle}</h2>
          <p className="landing-workflow-body">{t.landing.brandBody}</p>
          <div className="landing-brand-grid">
            <article className="landing-brand-card">
              <div className="landing-brand-mark">
                <span>E</span>
              </div>
              <p>{t.landing.brandIconLabel}</p>
            </article>
            <article className="landing-brand-card landing-brand-card-full">
              <AppLogo />
              <p>{t.landing.brandWordmarkLabel}</p>
            </article>
          </div>
        </section>

        <section className="card landing-pricing-bridge" id="pricing">
          <div className="section-heading">
            <p className="eyebrow">{t.landing.pricingEyebrow}</p>
            <h2>{t.landing.pricingTitle}</h2>
          </div>
          <div className="landing-pricing-preview">
            <div className="landing-pricing-preview-card">
              <strong>{t.pricing.starterPlan}</strong>
              <span>RM29</span>
              <p>{t.pricing.bestForStarter}</p>
            </div>
            <div className="landing-pricing-preview-card landing-pricing-preview-card-highlight">
              <strong>{t.pricing.proPlan}</strong>
              <span>RM49</span>
              <p>{t.pricing.bestForPro}</p>
            </div>
            <div className="landing-pricing-preview-card">
              <strong>{t.pricing.businessPlan}</strong>
              <span>RM79</span>
              <p>{t.pricing.bestForBusiness}</p>
            </div>
          </div>
          <Link to="/pricing" className="btn btn-secondary">
            {t.landing.seePricing}
          </Link>
        </section>

        <section className="landing-faq-grid">
          <div className="section-heading">
            <p className="eyebrow">{t.landing.faqEyebrow}</p>
            <h2>{t.landing.faqTitle}</h2>
          </div>
          {faqItems.map((item) => (
            <article key={item.question} className="card landing-faq-card">
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </section>

        <section className="card landing-final-cta">
          <div className="landing-cta-surface">
            <h2>{t.landing.finalCtaTitle}</h2>
            <p>{t.landing.finalCtaBody}</p>
            <div className="landing-cta-row">
              <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn btn-primary">
                {t.common.startFreeTrial}
              </Link>
              <Link to="/pricing" className="btn btn-secondary">
                {t.landing.seePricing}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="public-footer card landing-fat-footer">
        <div className="landing-fat-footer-grid">
          <div className="public-footer-copy">
            <AppLogo compact />
            <strong>{t.footer.tagline}</strong>
            <p>{t.footer.description}</p>
          </div>
          <div>
            <h4>{t.landing.footerProductTitle}</h4>
            <nav className="landing-footer-list">
              <Link to="/leads">{t.privateHeader.leads}</Link>
              <Link to="/ai">{t.privateHeader.ai}</Link>
              <Link to="/whatsapp">{t.privateHeader.whatsapp}</Link>
              <Link to="/reminders">{t.privateHeader.reminders}</Link>
            </nav>
          </div>
          <div>
            <h4>{t.landing.footerCompanyTitle}</h4>
            <nav className="landing-footer-list">
              <Link to="/pricing">{t.pricing.pricing}</Link>
              <Link to="/agent">{t.agent.title}</Link>
              <Link to="/login">{t.auth.login}</Link>
            </nav>
          </div>
          <div>
            <h4>{t.landing.footerSupportTitle}</h4>
            <nav className="landing-footer-list">
              <Link to="/pricing">{t.landing.seePricing}</Link>
              <Link to="/agent">{t.agent.title}</Link>
              <Link to={isAuthenticated ? '/dashboard' : '/login'}>
                {isAuthenticated ? t.publicHeader.openDashboard : t.common.startFreeTrial}
              </Link>
            </nav>
          </div>
        </div>
        <p className="public-footer-note">{t.footer.copyright}</p>
      </footer>
    </div>
  );
};

export default Landing;
