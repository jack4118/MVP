interface AppLogoProps {
  compact?: boolean;
}

const AppLogo = ({ compact = false }: AppLogoProps) => {
  const iconSize = compact ? 44 : 64;

  return (
    <div className={`app-logo ${compact ? 'app-logo-compact' : ''}`}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="ezreply-logo-gradient" x1="12" y1="12" x2="60" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4DB8FF" />
            <stop offset="0.5" stopColor="#4B68F1" />
            <stop offset="1" stopColor="#A15CF5" />
          </linearGradient>
          <filter id="ezreply-logo-shadow" x="0" y="0" width="72" height="72" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#5C53D6" floodOpacity="0.18" />
          </filter>
        </defs>
        <path
          d="M14 17.5C14 11.15 19.15 6 25.5 6H46.5C53.96 6 60 12.04 60 19.5V35C60 42.46 53.96 48.5 46.5 48.5H31.5L21.82 57.45C20.05 59.08 17.19 57.83 17.19 55.43V47.26C12.39 44.86 9 40.01 9 34.38V22.5C9 19.74 11.24 17.5 14 17.5Z"
          fill="url(#ezreply-logo-gradient)"
          filter="url(#ezreply-logo-shadow)"
        />
        <path
          d="M24.5 31.5 31.5 38.5 45.5 24.5"
          fill="white"
          stroke="white"
          strokeWidth="6.5"
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
