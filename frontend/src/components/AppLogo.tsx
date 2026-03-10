interface AppLogoProps {
  compact?: boolean;
}

const AppLogo = ({ compact = false }: AppLogoProps) => {
  const iconSize = compact ? 44 : 64;

  return (
    <div className={`app-logo ${compact ? 'app-logo-compact' : ''}`}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="ezreply-logo-gradient" x1="6" y1="10" x2="66" y2="62" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2DBDFF" />
            <stop offset="0.45" stopColor="#3C5BEE" />
            <stop offset="1" stopColor="#C25DF2" />
          </linearGradient>
          <filter id="ezreply-logo-shadow" x="0" y="0" width="72" height="72" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#5C53D6" floodOpacity="0.22" />
          </filter>
        </defs>
        <path
          d="M14 18.8C14 11.73 19.73 6 26.8 6H46.4C53.47 6 59.2 11.73 59.2 18.8V40.68C59.2 47.75 53.47 53.48 46.4 53.48H30.41L17.98 63.2C16.39 64.44 14 63.31 14 61.29V50.01C9.23 47.93 6 43.17 6 37.68V18.8C6 11.73 11.73 6 18.8 6H26.8"
          fill="url(#ezreply-logo-gradient)"
          filter="url(#ezreply-logo-shadow)"
        />
        <path
          d="M40.83 8.8 25.76 33.18h11.17L28.6 50.72 46.05 28.35H35.51L40.83 8.8Z"
          fill="white"
          stroke="white"
          strokeWidth="3"
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
