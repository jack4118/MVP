import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../hooks/useAuth';
import PublicHeader from '../components/PublicHeader';
import PublicFooter from '../components/PublicFooter';

const Landing = () => {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();

  const featureCards = [
    { title: t.landing.featureLeadTitle, body: t.landing.featureLeadBody },
    { title: t.landing.featureReminderTitle, body: t.landing.featureReminderBody },
    { title: t.landing.featureAiTitle, body: t.landing.featureAiBody },
    { title: t.landing.featureWhatsappTitle, body: t.landing.featureWhatsappBody },
  ];

  const socialProofLabels = [
    t.landing.socialChipProperty,
    t.landing.socialChipInsurance,
    t.landing.socialChipCars,
    t.landing.socialChipFreelancers,
  ];

  const faqItems = [
    { question: t.landing.faqApiQuestion, answer: t.landing.faqApiAnswer },
    { question: t.landing.faqCrmQuestion, answer: t.landing.faqCrmAnswer },
    { question: t.landing.faqAutoQuestion, answer: t.landing.faqAutoAnswer },
  ];

  return (
    <div className="landing-shell">
      <PublicHeader />

      <main className="landing-main">
        <section className="landing-hero card">
          <p className="eyebrow">{t.landing.eyebrow}</p>
          <h1>{t.landing.heroTitle}</h1>
          <p className="landing-subtitle">{t.landing.heroSubtitle}</p>
          <div className="landing-cta-row">
            <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn btn-primary">
              {t.common.startFreeTrial}
            </Link>
            <Link to="/pricing" className="btn btn-secondary">
              {t.landing.seePricing}
            </Link>
          </div>
          <p className="landing-outcome">{t.landing.outcomeStatement}</p>
        </section>

        <section className="card landing-problem">
          <p className="eyebrow">{t.landing.problemEyebrow}</p>
          <h2>{t.landing.problemTitle}</h2>
          <div className="landing-problem-quotes">
            <blockquote>{t.landing.problemQuote1}</blockquote>
            <blockquote>{t.landing.problemQuote2}</blockquote>
            <blockquote>{t.landing.problemQuote3}</blockquote>
          </div>
          <p className="landing-problem-punch">{t.landing.problemPunchline}</p>
          <p className="landing-problem-body">{t.landing.problemBody}</p>
        </section>

        <section className="card landing-solution">
          <p className="eyebrow">{t.landing.solutionEyebrow}</p>
          <h2>{t.landing.solutionTitle}</h2>
          <div className="landing-solution-flow" aria-label={t.landing.solutionTitle}>
            <span>{t.landing.solutionStep1}</span>
            <span>{t.landing.solutionStep2}</span>
            <span>{t.landing.solutionStep3}</span>
            <span>{t.landing.solutionStep4}</span>
          </div>
        </section>

        <section className="card landing-workflow">
          <p className="eyebrow">{t.landing.workflowEyebrow}</p>
          <h2>{t.landing.workflowTitle}</h2>
          <div className="landing-workflow-line">{t.landing.workflowLine}</div>
          <p className="landing-workflow-body">{t.landing.workflowBody}</p>
        </section>

        <section className="landing-feature-grid">
          {featureCards.map((feature) => (
            <article key={feature.title} className="card landing-feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </section>

        <section className="card landing-social-proof">
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
        </section>

        <section className="card landing-pricing-bridge">
          <div className="section-heading">
            <p className="eyebrow">{t.landing.pricingEyebrow}</p>
            <h2>{t.landing.pricingTitle}</h2>
            <p>{t.landing.pricingBody}</p>
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
          <h2>{t.landing.finalCtaTitle}</h2>
          <p>{t.landing.finalCtaBody}</p>
          <div className="landing-cta-row">
            <Link to={isAuthenticated ? '/dashboard' : '/login'} className="btn btn-primary">
              {t.common.startFreeTrial}
            </Link>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
};

export default Landing;
