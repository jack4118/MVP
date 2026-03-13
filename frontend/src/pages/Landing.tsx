import { Link } from 'react-router-dom';
import AppLogo from '../components/AppLogo';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

const Landing = () => {
  return (
    <div className="landing-shell">
      <header className="landing-header">
        <AppLogo />
        <div className="header-actions">
          <Link to="/pricing" className="btn btn-secondary">
            Pricing
          </Link>
          <Link to="/agent" className="btn btn-secondary">
            Waitlist
          </Link>
          <LanguageToggle />
          <ThemeToggle />
          <Link to="/login" className="btn btn-primary">
            Start Free Trial
          </Link>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero card">
          <p className="eyebrow">AI Follow-up Assistant for WhatsApp</p>
          <h1>Never forget to follow up your customers again.</h1>
          <p className="landing-subtitle">
            EzReply helps small businesses track leads, follow up at the right time, and close more deals on WhatsApp
            without building a complicated CRM habit.
          </p>
          <div className="landing-cta-row">
            <Link to="/login" className="btn btn-primary">
              Start Free Trial
            </Link>
            <Link to="/pricing" className="btn btn-secondary">
              See Pricing
            </Link>
          </div>
        </section>

        <section className="landing-proof-grid">
          <article className="card">
            <h3>What you sell</h3>
            <p>Lead tracking, AI drafts, and automatic follow-up in one WhatsApp-first workflow.</p>
          </article>
          <article className="card">
            <h3>Who it is for</h3>
            <p>Solo operators and small teams that live in WhatsApp and cannot afford to miss replies or payments.</p>
          </article>
          <article className="card">
            <h3>What changes daily</h3>
            <p>Open one dashboard, see who needs attention, send the next message, and move on.</p>
          </article>
        </section>

        <section className="landing-flow card">
          <p className="eyebrow">Core Workflow</p>
          <h2>Lead → Follow-up → Close</h2>
          <div className="landing-steps">
            <div>
              <strong>1. Capture leads</strong>
              <span>Store contact, notes, and conversation context.</span>
            </div>
            <div>
              <strong>2. Generate the next message</strong>
              <span>Use quick actions like Follow-up, Ask budget, or Payment reminder.</span>
            </div>
            <div>
              <strong>3. Let the system chase the next step</strong>
              <span>When the customer goes quiet, EzReply queues the next follow-up task.</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Landing;
