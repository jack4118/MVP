interface AppLogoProps {
  compact?: boolean;
}

const AppLogo = ({ compact = false }: AppLogoProps) => {
  const iconSize = compact ? 48 : 72;

  return (
    <div className={`app-logo ${compact ? 'app-logo-compact' : ''}`}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 80 80" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="ezreply-logo-gradient" x1="12" y1="10" x2="66" y2="64" gradientUnits="userSpaceOnUse">
            <stop stopColor="#56B7FF" />
            <stop offset="0.5" stopColor="#4A68F1" />
            <stop offset="1" stopColor="#A25AF2" />
          </linearGradient>
          <filter id="ezreply-logo-shadow" x="0" y="0" width="80" height="80" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#15233C" floodOpacity="0.16" />
          </filter>
        </defs>
        <path
          d="M26 12C15.51 12 7 20.51 7 31V44C7 54.49 15.51 63 26 63H29V72.2C29 73.84 30.96 74.7 32.17 73.59L43.25 63H55C65.49 63 74 54.49 74 44V31C74 20.51 65.49 12 55 12H26Z"
          fill="url(#ezreply-logo-gradient)"
          filter="url(#ezreply-logo-shadow)"
        />
        <path
          d="M28 39 36.5 47.5 53.5 29.5"
          fill="white"
          stroke="white"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="app-logo-wordmark">
        <span>EzReply</span>
      </div>
    </div>
  );
};

export default AppLogo;
