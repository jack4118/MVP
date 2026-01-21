import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { authApi, User, LoginResponse, ApiResponse } from '../services/api';
import { storage } from '../utils/storage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<ApiResponse<LoginResponse>>;
  register: (email: string, password: string) => Promise<ApiResponse<User> | ApiResponse<LoginResponse>>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = storage.getToken();
    if (token) {
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    if (response.success && response.data) {
      storage.setToken(response.data.token);
      setUser(response.data.user);
    } else {
      // Return the response so the caller can handle the error
      return response;
    }
    return response;
  };

  const register = async (email: string, password: string) => {
    const response = await authApi.register(email, password);
    if (response.success && response.data) {
      const loginResponse = await authApi.login(email, password);
      if (loginResponse.success && loginResponse.data) {
        storage.setToken(loginResponse.data.token);
        setUser(loginResponse.data.user);
        return loginResponse;
      } else {
        return loginResponse;
      }
    } else {
      // Return the response so the caller can handle the error
      return response;
    }
  };

  const logout = () => {
    storage.removeToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

