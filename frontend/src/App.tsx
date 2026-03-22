import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { useState } from 'react';
import { AiTone, AppLanguage } from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Reminders from './pages/Reminders';
import AI from './pages/AI';
import WhatsApp from './pages/WhatsApp';
import Pricing from './pages/Pricing';
import AgentProgram from './pages/AgentProgram';
import Landing from './pages/Landing';
import Settings from './pages/Settings';
import BackendShell from './components/BackendShell';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading, user, updateProfile } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const [savingOnboarding, setSavingOnboarding] = useState(false);
  const [onboardingError, setOnboardingError] = useState('');
  const [onboardingForm, setOnboardingForm] = useState({
    industry: '',
    defaultLanguage: 'en' as AppLanguage,
    defaultTone: 'polite' as AiTone,
  });

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>{t.common.loading}</p>
      </div>
    );
  }

  const redirect = `${location.pathname}${location.search}`;

  const handleOnboardingSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSavingOnboarding(true);
      setOnboardingError('');
      const response = await updateProfile({
        hasCompletedOnboarding: true,
        industry: onboardingForm.industry.trim() || null,
        defaultLanguage: onboardingForm.defaultLanguage,
        defaultTone: onboardingForm.defaultTone,
      });
      if (!response.success) {
        setOnboardingError(response.error?.message || t.common.error);
      }
    } finally {
      setSavingOnboarding(false);
    }
  };

  if (!isAuthenticated) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  if (user && !user.hasCompletedOnboarding) {
    return (
      <div className="page-container">
        <div className="modal-shell">
          <div className="card quick-ai-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="quick-ai-header">
              <div>
                <h2>{t.profile.onboardingTitle}</h2>
                <p>{t.profile.onboardingSubtitle}</p>
              </div>
            </div>
            {onboardingError ? <div className="alert alert-error">{onboardingError}</div> : null}
            <form onSubmit={handleOnboardingSubmit}>
              <div className="form-group">
                <label className="form-label">{t.profile.industry}</label>
                <input
                  className="input"
                  value={onboardingForm.industry}
                  onChange={(e) => setOnboardingForm((current) => ({ ...current, industry: e.target.value }))}
                  placeholder={t.profile.industryPlaceholder}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t.profile.defaultLanguage}</label>
                <select
                  className="input"
                  value={onboardingForm.defaultLanguage}
                  onChange={(e) => setOnboardingForm((current) => ({ ...current, defaultLanguage: e.target.value as AppLanguage }))}
                >
                  <option value="en">EN</option>
                  <option value="zh-CN">中文</option>
                  <option value="ms">BM</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t.profile.defaultTone}</label>
                <select
                  className="input"
                  value={onboardingForm.defaultTone}
                  onChange={(e) => setOnboardingForm((current) => ({ ...current, defaultTone: e.target.value as AiTone }))}
                >
                  <option value="polite">{t.ai.polite}</option>
                  <option value="friendly">{t.ai.friendly}</option>
                  <option value="professional">{t.ai.professional}</option>
                </select>
              </div>
              <div className="profile-actions">
                <button type="submit" className="btn btn-primary" disabled={savingOnboarding}>
                  {savingOnboarding ? t.common.loading : t.profile.onboardingSubmit}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return <BackendShell>{children}</BackendShell>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Landing />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/leads"
        element={
          <PrivateRoute>
            <Leads />
          </PrivateRoute>
        }
      />
      <Route
        path="/reminders"
        element={
          <PrivateRoute>
            <Reminders />
          </PrivateRoute>
        }
      />
      <Route
        path="/ai"
        element={
          <PrivateRoute>
            <AI />
          </PrivateRoute>
        }
      />
      <Route
        path="/ai-composer"
        element={
          <PrivateRoute>
            <Navigate to="/ai" replace />
          </PrivateRoute>
        }
      />
      <Route
        path="/whatsapp"
        element={
          <PrivateRoute>
            <WhatsApp />
          </PrivateRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <PrivateRoute>
            <Settings />
          </PrivateRoute>
        }
      />
      <Route path="/profile" element={<Navigate to="/settings" replace />} />
      <Route
        path="/app/pricing"
        element={
          <PrivateRoute>
            <Pricing />
          </PrivateRoute>
        }
      />
      <Route
        path="/app/agent"
        element={
          <PrivateRoute>
            <AgentProgram />
          </PrivateRoute>
        }
      />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/agent" element={<AgentProgram />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <AppRoutes />
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}

export default App;
