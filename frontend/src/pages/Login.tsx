import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage, translate } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const result = await register(email, password);
        if (!result.success) {
          setError(result.error?.message || t.auth.registrationFailed);
          setLoading(false);
          return;
        }
      } else {
        const result = await login(email, password);
        if (!result.success) {
          setError(result.error?.message || t.auth.loginFailed);
          setLoading(false);
          return;
        }
      }
      navigate('/dashboard');
    } catch (err: any) {
      if (err?.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else if (err?.message) {
        setError(err.message);
      } else {
        setError(t.common.error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-header">
        <LanguageToggle />
        <ThemeToggle />
      </div>
      <div className="login-card">
        <div className="login-header-content">
          <h1 className="login-title">{isRegister ? t.auth.createAccount : t.auth.welcomeBack}</h1>
          <p className="login-subtitle">
            {isRegister ? t.auth.signUpToStart : t.auth.signInToContinue}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email" className="form-label">{t.auth.email}</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input"
              placeholder={t.auth.enterEmail}
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">{t.auth.password}</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="input"
              placeholder={t.auth.enterPassword}
              disabled={loading}
            />
            {isRegister && (
              <small className="form-hint">{t.auth.passwordMinLength}</small>
            )}
          </div>

          {error && (
            <div className="alert alert-error">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary login-button"
          >
            {loading ? (
              <>
                <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
                <span>{t.common.loading}</span>
              </>
            ) : (
              <span>{isRegister ? t.auth.createAccount : t.auth.signIn}</span>
            )}
          </button>
        </form>

        <div className="login-footer">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="link-button"
          >
            {isRegister ? t.auth.alreadyHaveAccount : t.auth.dontHaveAccount}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
