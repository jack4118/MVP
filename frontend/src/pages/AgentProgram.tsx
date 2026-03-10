import { useState } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';
import AppLogo from '../components/AppLogo';
import { useLanguage } from '../contexts/LanguageContext';

const mockRows = [
  { referral: 'Aina Studio', status: 'Active', plan: 'Pro', commission: 'RM9.80', joined: '2026-02-22' },
  { referral: 'Jun Repair', status: 'Trial', plan: 'Starter', commission: 'RM0.00', joined: '2026-03-02' },
  { referral: 'Kite Agency', status: 'Active', plan: 'Pro', commission: 'RM9.80', joined: '2026-03-06' },
];

const AgentProgram = () => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const referralLink = 'https://ezreply.app/ref/demo-agent';

  const cards = [
    { label: t.agent.totalReferrals, value: '12' },
    { label: t.agent.activeSubscribers, value: '5' },
    { label: t.agent.monthlyCommission, value: 'RM49.00' },
  ];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            <h1 className="page-title">{t.agent.title}</h1>
          </div>
        </div>
        <div className="header-actions">
          <Link to="/pricing" className="btn btn-secondary">
            {t.pricing.pricing}
          </Link>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <section className="agent-hero card">
        <p className="eyebrow">{t.agent.subtitle}</p>
        <h2>{t.agent.heroTitle}</h2>
        <p>{t.agent.heroDescription}</p>
        <div className="agent-pilot-note">{t.agent.pilotNote}</div>
      </section>

      <section className="agent-incentive-grid">
        <div className="card">
          <h3>{t.agent.incentiveTitle}</h3>
          <ul className="pricing-feature-list">
            <li>{t.agent.incentiveCommission}</li>
            <li>{t.agent.incentiveDiscount}</li>
            <li>{t.agent.comingSoon}</li>
          </ul>
        </div>
        <div className="card">
          <h3>{t.agent.referralLink}</h3>
          <div className="referral-link-box">{referralLink}</div>
          <button className="btn btn-primary" onClick={handleCopy}>
            {copied ? t.agent.copiedLink : t.agent.copyLink}
          </button>
        </div>
      </section>

      <section className="agent-stats-grid">
        {cards.map((card) => (
          <div key={card.label} className="card stat-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="section-heading">
          <h3>{t.agent.earningsTitle}</h3>
          <p>{t.agent.emptyHint}</p>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.agent.tableReferral}</th>
                <th>{t.agent.tableStatus}</th>
                <th>{t.agent.tablePlan}</th>
                <th>{t.agent.tableCommission}</th>
                <th>{t.agent.tableJoined}</th>
              </tr>
            </thead>
            <tbody>
              {mockRows.map((row) => (
                <tr key={`${row.referral}-${row.joined}`}>
                  <td>{row.referral}</td>
                  <td>{row.status}</td>
                  <td>{row.plan}</td>
                  <td>{row.commission}</td>
                  <td>{row.joined}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card pricing-note-card">
        <p>{t.agent.riskNote}</p>
      </section>
    </div>
  );
};

export default AgentProgram;
