import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import PublicHeader from '../components/PublicHeader';
import PublicFooter from '../components/PublicFooter';

const AgentProgram = () => {
  const { t } = useLanguage();
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const isAppEmbedded = location.pathname.startsWith('/app/');
  const referralLink = 'https://ezreply.app/ref/demo-agent';
  const mockRows = useMemo(
    () => [
      { referral: 'Aina Studio', status: t.agent.mockStatusActive, plan: t.agent.mockPlanPro, commission: 'RM9.80', joined: '2026-02-22' },
      { referral: 'Jun Repair', status: t.agent.mockStatusTrial, plan: t.agent.mockPlanStarter, commission: 'RM0.00', joined: '2026-03-02' },
      { referral: 'Kite Agency', status: t.agent.mockStatusActive, plan: t.agent.mockPlanPro, commission: 'RM9.80', joined: '2026-03-06' },
    ],
    [t]
  );

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
    <div className="landing-shell">
      {!isAppEmbedded ? <PublicHeader /> : null}
      <main className="landing-main">
        <section className="agent-hero card">
          <p className="eyebrow">{t.agent.waitlistEyebrow}</p>
          <h1>{t.agent.title}</h1>
          <h2>{t.agent.heroTitle}</h2>
          <p>{t.agent.heroDescription}</p>
          <div className="agent-pilot-note">{t.agent.waitlistNote}</div>
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
      </main>
      {!isAppEmbedded ? <PublicFooter /> : null}
    </div>
  );
};

export default AgentProgram;
