import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Reminders from './pages/Reminders';
import AI from './pages/AI';
import WhatsApp from './pages/WhatsApp';
import Pricing from './pages/Pricing';
import AgentProgram from './pages/AgentProgram';
import Landing from './pages/Landing';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>{t.common.loading}</p>
      </div>
    );
  }

  const redirect = `${location.pathname}${location.search}`;

  return isAuthenticated ? <>{children}</> : <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
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
        path="/whatsapp"
        element={
          <PrivateRoute>
            <WhatsApp />
          </PrivateRoute>
        }
      />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/agent" element={<AgentProgram />} />
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
