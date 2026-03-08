import { useLanguage, Language } from '../contexts/LanguageContext';

const options: Array<{ value: Language; label: string }> = [
  { value: 'en', label: 'EN' },
  { value: 'zh-CN', label: '中文' },
  { value: 'ms', label: 'BM' },
];

const LanguageToggle = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <select
      value={language}
      onChange={(e) => setLanguage(e.target.value as Language)}
      className="language-toggle"
      aria-label="Language selector"
      title="Language"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export default LanguageToggle;
