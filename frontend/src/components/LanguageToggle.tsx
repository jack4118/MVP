import { useLanguage } from '../contexts/LanguageContext';

const LanguageToggle = () => {
  const { language, setLanguage } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'zh-CN' : 'en');
  };

  return (
    <button
      onClick={toggleLanguage}
      className="language-toggle"
      aria-label="Toggle language"
      title={language === 'en' ? '切换到中文' : 'Switch to English'}
    >
      {language === 'en' ? (
        <span style={{ fontSize: '14px', fontWeight: 600 }}>中文</span>
      ) : (
        <span style={{ fontSize: '14px', fontWeight: 600 }}>EN</span>
      )}
    </button>
  );
};

export default LanguageToggle;

