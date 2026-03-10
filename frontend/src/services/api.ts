import axios, { AxiosError, AxiosInstance } from 'axios';
import { storage } from '../utils/storage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export type UserPlan = 'free' | 'pro';
export type LeadStatus = 'new' | 'contacted' | 'interested' | 'waiting_reply' | 'not_interested' | 'closed';
export type AiTone = 'polite' | 'friendly' | 'professional' | 'casual' | 'assertive' | 'empathetic' | 'urgent';
export type ConversationMode = 'standard' | 'humor' | 'banter' | 'direct' | 'consultative';
export type EmojiDensity = 'low' | 'medium' | 'high';
export type FollowUpStylePreset = 'gentle_nudge' | 'value_reminder' | 'meeting_request' | 'deadline_push' | 'social_proof';
export type PaymentStylePreset = 'friendly_reminder' | 'due_today' | 'overdue_escalation' | 'installment_offer' | 'soft_final_notice';
export type OutputFormat = 'chat' | 'email' | 'whatsapp';
export type AppLanguage = 'en' | 'zh-CN' | 'ms';
export type ProductEvent =
  | 'ai_generate_clicked'
  | 'ai_generate_success'
  | 'ai_generate_failed_limit'
  | 'copy_clicked'
  | 'upgrade_modal_opened'
  | 'upgrade_confirmed'
  | 'lead_created'
  | 'first_value_moment';

export interface UsageInfo {
  plan: UserPlan;
  leadCount: number;
  leadLimit: number | null;
  aiUsageThisMonth: number;
  aiLimit: number | null;
  aiRemaining: number | null;
  aiUsagePercent: number;
  canCreateLead: boolean;
  canUseAi: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
  usage?: UsageInfo;
}

const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = storage.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      const url = error.config?.url || '';
      const isMeRequest = url.includes('/auth/me');
      const isLoginOrRegister = url.includes('/auth/login') || url.includes('/auth/register');

      if (isMeRequest) {
        storage.removeToken();
      } else if (!isLoginOrRegister) {
        storage.removeToken();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Lead {
  id: string;
  userId: string;
  name: string;
  contact?: string;
  notes?: string;
  status: LeadStatus;
  lastActivityAt?: string;
  createdAt: string;
}

export interface Reminder {
  id: string;
  leadId: string;
  type: string;
  triggerAt: string;
  isDone: boolean;
  lead: {
    id: string;
    name: string;
    contact?: string;
    status: LeadStatus;
  };
}

export interface ReminderDispatchLog {
  id: string;
  reminderId: string;
  userId: string;
  dispatchKey: string;
  channel: 'in_app' | 'whatsapp';
  status: 'sent' | 'failed' | 'requires_template' | 'skipped';
  error?: string | null;
  sentAt: string;
  reminder: {
    id: string;
    type: string;
    triggerAt: string;
    lead: {
      id: string;
      name: string;
      contact?: string | null;
    };
  };
}

export interface AiHistoryItem {
  id: string;
  leadId: string;
  userId: string;
  purpose: 'follow_up' | 'payment';
  stylePreset?: string | null;
  content: string;
  createdAt: string;
  lead: {
    id: string;
    name: string;
  };
}

export interface AiGenerationDebug {
  requested: {
    language: AppLanguage;
    outputFormat: OutputFormat;
    tone: AiTone;
    conversationMode: ConversationMode;
    emojiDensity: EmojiDensity;
  };
  checks: {
    emojiCount: number;
    emojiMin: number;
    emojiMax: number;
    emojiInRange: boolean;
    modeSignalDetected: boolean;
    objectiveCoverageRatio: number;
    objectiveCoveragePass: boolean;
  };
}

export interface WhatsAppConnection {
  id: string;
  userId: string;
  businessAccountId: string;
  phoneNumberId: string;
  displayPhone?: string | null;
  isActive: boolean;
  lastVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppLogItem {
  id: string;
  userId: string;
  leadId?: string | null;
  messageId?: string | null;
  direction?: 'inbound' | 'outbound';
  fromPhone?: string | null;
  toPhone: string;
  content: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
  error?: string | null;
  externalTimestamp?: string | null;
  createdAt: string;
  lead?: {
    id: string;
    name: string;
  } | null;
}

export interface WhatsAppContactSummary {
  phone: string;
  totalMessages: number;
  sentCount: number;
  failedCount: number;
  lastStatus: string;
  lastMessage: string;
  lastError?: string | null;
  lastAt: string;
  lead?: {
    id: string;
    name: string;
    status: LeadStatus;
  } | null;
}

export interface WhatsAppContactsPage {
  items: WhatsAppContactSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const authApi = {
  register: async (email: string, password: string): Promise<ApiResponse<User>> => {
    try {
      const response = await api.post<ApiResponse<User>>('/auth/register', { email, password });
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        return error.response.data;
      }
      throw error;
    }
  },

  login: async (email: string, password: string): Promise<ApiResponse<LoginResponse>> => {
    try {
      const response = await api.post<ApiResponse<LoginResponse>>('/auth/login', { email, password });
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        return error.response.data;
      }
      throw error;
    }
  },

  getCurrentUser: async (): Promise<ApiResponse<User>> => {
    try {
      const response = await api.get<ApiResponse<User>>('/auth/me');
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        return error.response.data;
      }
      throw error;
    }
  },
};

export const leadsApi = {
  getLeads: async (): Promise<ApiResponse<Lead[]>> => {
    const response = await api.get<ApiResponse<Lead[]>>('/leads');
    return response.data;
  },

  createLead: async (data: {
    name: string;
    contact?: string;
    notes?: string;
    status?: LeadStatus;
  }): Promise<ApiResponse<Lead>> => {
    const response = await api.post<ApiResponse<Lead>>('/leads', data);
    return response.data;
  },

  updateLead: async (
    id: string,
    data: {
      name?: string;
      contact?: string;
      notes?: string;
      status?: LeadStatus;
    }
  ): Promise<ApiResponse<Lead>> => {
    const response = await api.put<ApiResponse<Lead>>(`/leads/${id}`, data);
    return response.data;
  },

  updateLeadStatus: async (id: string, status: LeadStatus): Promise<ApiResponse<Lead>> => {
    const response = await api.put<ApiResponse<Lead>>(`/leads/${id}/status`, { status });
    return response.data;
  },
};

export const remindersApi = {
  getReminders: async (params?: {
    view?: 'today' | 'upcoming' | 'all';
    status?: 'all' | 'pending' | 'done';
    days?: number;
  }): Promise<ApiResponse<Reminder[]>> => {
    const response = await api.get<ApiResponse<Reminder[]>>('/reminders', { params });
    return response.data;
  },

  getTodayReminders: async (): Promise<ApiResponse<Reminder[]>> => {
    const response = await api.get<ApiResponse<Reminder[]>>('/reminders/today');
    return response.data;
  },

  createReminder: async (data: {
    leadId: string;
    type: 'follow_up' | 'payment' | 'meeting' | 'custom';
    triggerAt: string;
  }): Promise<ApiResponse<Reminder>> => {
    const response = await api.post<ApiResponse<Reminder>>('/reminders', data);
    return response.data;
  },

  markDone: async (id: string): Promise<ApiResponse<Reminder>> => {
    const response = await api.post<ApiResponse<Reminder>>(`/reminders/${id}/done`);
    return response.data;
  },

  updateReminder: async (
    id: string,
    data: {
      type?: 'follow_up' | 'payment' | 'meeting' | 'custom';
      triggerAt?: string;
      isDone?: boolean;
    }
  ): Promise<ApiResponse<Reminder>> => {
    const response = await api.put<ApiResponse<Reminder>>(`/reminders/${id}`, data);
    return response.data;
  },

  deleteReminder: async (id: string): Promise<ApiResponse<{ deleted: boolean }>> => {
    const response = await api.delete<ApiResponse<{ deleted: boolean }>>(`/reminders/${id}`);
    return response.data;
  },

  getDispatchLogs: async (limit: number = 30): Promise<ApiResponse<ReminderDispatchLog[]>> => {
    const response = await api.get<ApiResponse<ReminderDispatchLog[]>>('/reminders/dispatch-logs', { params: { limit } });
    return response.data;
  },

  runDispatchNow: async (): Promise<ApiResponse<{ scanned: number; processed: number }>> => {
    const response = await api.post<ApiResponse<{ scanned: number; processed: number }>>('/reminders/dispatch/run');
    return response.data;
  },
};

export const aiApi = {
  generateFollowUp: async (data: {
    leadId: string;
    leadName: string;
    objective: string;
    status?: LeadStatus;
    daysPassed?: number;
    tone?: AiTone;
    stylePreset?: FollowUpStylePreset;
    conversationMode?: ConversationMode;
    emojiDensity?: EmojiDensity;
    outputFormat?: OutputFormat;
    language?: AppLanguage;
  }): Promise<ApiResponse<{ text: string; debug?: AiGenerationDebug }>> => {
    const response = await api.post<ApiResponse<{ text: string; debug?: AiGenerationDebug }>>('/ai/follow-up', data);
    return response.data;
  },

  generatePayment: async (data: {
    leadId: string;
    leadName: string;
    objective: string;
    amount?: number;
    dueDate?: string;
    tone?: AiTone;
    stylePreset?: PaymentStylePreset;
    conversationMode?: ConversationMode;
    emojiDensity?: EmojiDensity;
    outputFormat?: OutputFormat;
    language?: AppLanguage;
  }): Promise<ApiResponse<{ text: string; debug?: AiGenerationDebug }>> => {
    const response = await api.post<ApiResponse<{ text: string; debug?: AiGenerationDebug }>>('/ai/payment', data);
    return response.data;
  },

  getHistory: async (params?: {
    limit?: number;
    purpose?: 'follow_up' | 'payment' | 'all';
  }): Promise<ApiResponse<AiHistoryItem[]>> => {
    const response = await api.get<ApiResponse<AiHistoryItem[]>>('/ai/history', { params });
    return response.data;
  },
};

export const usageApi = {
  getUsage: async (): Promise<ApiResponse<UsageInfo>> => {
    const response = await api.get<ApiResponse<UsageInfo>>('/usage');
    return response.data;
  },

  upgradeToPro: async (): Promise<ApiResponse<UsageInfo>> => {
    const response = await api.post<ApiResponse<UsageInfo>>('/usage/upgrade');
    return response.data;
  },
};

export const eventsApi = {
  track: async (event: ProductEvent, props?: Record<string, unknown>): Promise<void> => {
    await api.post('/events', { event, props });
  },

  getDailyStats: async (days: number = 30): Promise<ApiResponse<Array<Record<string, unknown>>>> => {
    const response = await api.get<ApiResponse<Array<Record<string, unknown>>>>('/events/stats/daily', {
      params: { days },
    });
    return response.data;
  },
};

export const whatsappApi = {
  getConnection: async (): Promise<ApiResponse<WhatsAppConnection | null>> => {
    const response = await api.get<ApiResponse<WhatsAppConnection | null>>('/whatsapp/connection');
    return response.data;
  },

  saveConnection: async (data: {
    businessAccountId: string;
    phoneNumberId: string;
    accessToken: string;
  }): Promise<ApiResponse<{ saved: boolean }>> => {
    const response = await api.post<ApiResponse<{ saved: boolean }>>('/whatsapp/connection', data);
    return response.data;
  },

  verifyConnection: async (): Promise<ApiResponse<{ connected: boolean; displayPhone?: string | null; verifiedName?: string | null }>> => {
    const response = await api.post<ApiResponse<{ connected: boolean; displayPhone?: string | null; verifiedName?: string | null }>>('/whatsapp/connection/verify');
    return response.data;
  },

  sendText: async (data: {
    toPhone: string;
    content: string;
    leadId?: string;
  }): Promise<ApiResponse<{ sent: boolean; messageId?: string; toPhone: string }>> => {
    const response = await api.post<ApiResponse<{ sent: boolean; messageId?: string; toPhone: string }>>('/whatsapp/send', data);
    return response.data;
  },

  getLogs: async (limit: number = 30): Promise<ApiResponse<WhatsAppLogItem[]>> => {
    const response = await api.get<ApiResponse<WhatsAppLogItem[]>>('/whatsapp/logs', { params: { limit } });
    return response.data;
  },

  getContacts: async (params?: { q?: string; page?: number; pageSize?: number }): Promise<ApiResponse<WhatsAppContactsPage>> => {
    const response = await api.get<ApiResponse<WhatsAppContactsPage>>('/whatsapp/contacts', { params });
    return response.data;
  },

  getMessages: async (phone: string, limit: number = 100): Promise<ApiResponse<WhatsAppLogItem[]>> => {
    const response = await api.get<ApiResponse<WhatsAppLogItem[]>>('/whatsapp/messages', { params: { phone, limit } });
    return response.data;
  },
};

export default api;
