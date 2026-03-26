import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import {
  authApi,
  User,
  LoginResponse,
  ApiResponse,
  AppLanguage,
  AiTone,
  ConversationMode,
  EmojiDensity,
  BaseStyleTone,
  PersonalizationLevel,
  HeadersListsLevel,
  OutputFormat,
} from '../services/api';
import { storage } from '../utils/storage';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<ApiResponse<LoginResponse>>;
  register: (email: string, password: string) => Promise<ApiResponse<User> | ApiResponse<LoginResponse>>;
  updateProfile: (data: {
    hasCompletedOnboarding?: boolean | null;
    displayName?: string | null;
    companyName?: string | null;
    industry?: string | null;
    defaultLanguage?: AppLanguage | null;
    defaultTone?: AiTone | null;
    defaultConversationMode?: ConversationMode | null;
    defaultEmojiDensity?: EmojiDensity | null;
    defaultOutputFormat?: OutputFormat | null;
    baseStyleTone?: BaseStyleTone | null;
    characterWarmth?: PersonalizationLevel | null;
    characterEnthusiasm?: PersonalizationLevel | null;
    characterHeadersLists?: HeadersListsLevel | null;
    characterEmoji?: PersonalizationLevel | null;
    customInstructions?: string | null;
    nickname?: string | null;
    occupation?: string | null;
    aboutYou?: string | null;
    memoryEnabled?: boolean;
    recordHistoryEnabled?: boolean;
    defaultFollowUpDays?: number | null;
    defaultCountryCode?: string | null;
    inboxDefaultView?: 'inbox' | 'contacts' | 'setup' | null;
    notifyNewInbound?: boolean;
    notifyReminderDue?: boolean;
    notifyDailyDigestHour?: number | null;
  }) => Promise<ApiResponse<User>>;
  refreshUser: () => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const syncPreferredLanguage = (nextUser: User | null, force = false) => {
    const preferredLanguage = nextUser?.defaultLanguage;
    const existingLocalLanguage = localStorage.getItem('language');
    if (preferredLanguage && (force || !existingLocalLanguage)) {
      localStorage.setItem('language', preferredLanguage);
      window.dispatchEvent(new CustomEvent('ezreply-language-changed', { detail: preferredLanguage }));
    }
  };

  const refreshUser = async () => {
    const response = await authApi.getCurrentUser();
    if (response.success && response.data) {
      setUser(response.data);
      syncPreferredLanguage(response.data);
    } else {
      storage.removeToken();
      setUser(null);
    }
  };

  useEffect(() => {
    const loadUser = async () => {
      const token = storage.getToken();
      if (token) {
        try {
          await refreshUser();
        } catch (error) {
          // Token is invalid or expired, remove it
          storage.removeToken();
          setUser(null);
        }
      }
      setLoading(false);
    };

    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    if (response.success && response.data) {
      storage.setToken(response.data.token);
      setUser(response.data.user);
      syncPreferredLanguage(response.data.user);
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
        syncPreferredLanguage(loginResponse.data.user);
        return loginResponse;
      } else {
        return loginResponse;
      }
    } else {
      // Return the response so the caller can handle the error
      return response;
    }
  };

  const updateProfile = async (data: {
    hasCompletedOnboarding?: boolean | null;
    displayName?: string | null;
    companyName?: string | null;
    industry?: string | null;
    defaultLanguage?: AppLanguage | null;
    defaultTone?: AiTone | null;
    defaultConversationMode?: ConversationMode | null;
    defaultEmojiDensity?: EmojiDensity | null;
    defaultOutputFormat?: OutputFormat | null;
    baseStyleTone?: BaseStyleTone | null;
    characterWarmth?: PersonalizationLevel | null;
    characterEnthusiasm?: PersonalizationLevel | null;
    characterHeadersLists?: HeadersListsLevel | null;
    characterEmoji?: PersonalizationLevel | null;
    customInstructions?: string | null;
    nickname?: string | null;
    occupation?: string | null;
    aboutYou?: string | null;
    memoryEnabled?: boolean;
    recordHistoryEnabled?: boolean;
    defaultFollowUpDays?: number | null;
    defaultCountryCode?: string | null;
    inboxDefaultView?: 'inbox' | 'contacts' | 'setup' | null;
    notifyNewInbound?: boolean;
    notifyReminderDue?: boolean;
    notifyDailyDigestHour?: number | null;
  }) => {
    const response = await authApi.updateCurrentUser(data);
    if (response.success && response.data) {
      setUser(response.data);
      syncPreferredLanguage(response.data, !!data.defaultLanguage);
    }
    return response;
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
        updateProfile,
        refreshUser,
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
