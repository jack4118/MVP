import { useLanguage } from '../contexts/LanguageContext';

interface AuthenticatedHeaderProps {
  title: string;
  subtitle?: string;
  whatsappUnreadCount?: number;
}

const AuthenticatedHeader = ({ title, subtitle, whatsappUnreadCount = 0 }: AuthenticatedHeaderProps) => {
  const { t } = useLanguage();

  return (
    <header className="page-header backend-page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {whatsappUnreadCount > 0 ? <span className="task-pill">{t.privateHeader.unreadLabel}: {whatsappUnreadCount}</span> : null}
    </header>
  );
};

export default AuthenticatedHeader;
