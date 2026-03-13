interface AppLogoProps {
  compact?: boolean;
}

const AppLogo = ({ compact = false }: AppLogoProps) => {
  const iconSize = compact ? 44 : 64;

  return (
    <div className={`app-logo ${compact ? 'app-logo-compact' : ''}`}>
      <svg width={iconSize} height={iconSize} viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="ezreply-logo-gradient" x1="10" y1="10" x2="60" y2="60" gradientUnits="userSpaceOnUse">
            <stop stopColor="#43B4FF" />
            <stop offset="0.52" stopColor="#4B68F1" />
            <stop offset="1" stopColor="#A05CF5" />
          </linearGradient>
          <filter id="ezreply-logo-shadow" x="0" y="0" width="72" height="72" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#5C53D6" floodOpacity="0.22" />
          </filter>
        </defs>
        <path
          d="M14 16.5C14 10.15 19.15 5 25.5 5H46.5C55.61 5 63 12.39 63 21.5V35.5C63 44.61 55.61 52 46.5 52H31.42L20.5 61.17C18.72 62.66 16 61.39 16 59.07V50.79C10.18 47.58 6.25 41.39 6.25 34.28V26.5C6.25 20.98 10.73 16.5 16.25 16.5H14Z"
          fill="url(#ezreply-logo-gradient)"
          filter="url(#ezreply-logo-shadow)"
        />
        <path
          d="M23.5 32.77 31.54 40.81 48.48 23.87"
          fill="white"
          stroke="white"
          strokeWidth="7"
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
