interface AppLogoProps {
  compact?: boolean;
}

const AppLogo = ({ compact = false }: AppLogoProps) => {
  return (
    <div className={`app-logo ${compact ? 'app-logo-compact' : ''}`}>
      <span className="app-logo-mark" aria-hidden="true">
        E
      </span>
      <div className="app-logo-wordmark">
        <span>EzReply</span>
      </div>
    </div>
  );
};

export default AppLogo;
