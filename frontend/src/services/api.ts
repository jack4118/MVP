import axios, { AxiosError, AxiosInstance } from 'axios';
import { storage } from '../utils/storage';

const PROD_API_URL = 'https://mvp-backend-rqzt.onrender.com';
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PROD_API_URL : 'http://localhost:3001');

export type UserPlan = 'free' | 'pro';
export type LeadStatus = 'new' | 'waiting_reply' | 'follow_up_due' | 'won' | 'lost';
export type AiTone = 'polite' | 'friendly' | 'professional' | 'casual' | 'assertive' | 'empathetic' | 'urgent';
export type ConversationMode = 'standard' | 'humor' | 'banter' | 'direct' | 'consultative';
export type EmojiDensity = 'low' | 'medium' | 'high';
export type BaseStyleTone = 'default' | 'professional' | 'friendly' | 'concise';
export type PersonalizationLevel = 'default' | 'low' | 'medium' | 'high';
export type HeadersListsLevel = 'default' | 'minimal' | 'structured';
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

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError<ApiResponse<unknown>>(error)) {
    const payload = error.response?.data as
      | (ApiResponse<unknown> & { message?: string; error?: { message?: string } | string })
      | undefined;

    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return payload.error;
    }

    if (payload?.error && typeof payload.error === 'object' && payload.error.message) {
      return payload.error.message;
    }

    if (payload?.message) {
      return payload.message;
    }

    return error.message || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const api: AxiosInstance = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRedirectingToLogin = false;

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
        if (!isRedirectingToLogin) {
          isRedirectingToLogin = true;
          const redirect = `${window.location.pathname}${window.location.search}`;
          window.location.href = `/login?redirect=${encodeURIComponent(redirect)}&reason=session_expired`;
        }
      } else if (!isLoginOrRegister) {
        storage.removeToken();
        if (!isRedirectingToLogin) {
          isRedirectingToLogin = true;
          const redirect = `${window.location.pathname}${window.location.search}`;
          window.location.href = `/login?redirect=${encodeURIComponent(redirect)}&reason=session_expired`;
        }
      }
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: string;
  email: string;
  createdAt: string;
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
  securityLastPasswordAt?: string | null;
  securityLastLoginAt?: string | null;
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
  stage?: string;
  tags?: string[] | null;
  memorySummary?: string | null;
  memoryGoal?: string | null;
  memoryLanguage?: AppLanguage | null;
  aiTonePreference?: AiTone | null;
  aiConversationMode?: ConversationMode | null;
  aiEmojiDensity?: EmojiDensity | null;
  aiOutputFormat?: OutputFormat | null;
  memoryUpdatedAt?: string | null;
  lastActivityAt?: string;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  nextFollowUpAt?: string | null;
  closedReason?: string | null;
  createdAt: string;
}

export interface TodayTask {
  id: string;
  type: string;
  triggerAt: string;
  isOverdue: boolean;
  isSystemTask: boolean;
  suggestedActions: string[];
  lead: {
    id: string;
    name: string;
    contact?: string | null;
    status: LeadStatus;
    nextFollowUpAt?: string | null;
    lastInboundAt?: string | null;
    lastOutboundAt?: string | null;
  };
}

export interface DashboardSummary {
  todayTasks: TodayTask[];
  overdueFollowUps: number;
  waitingPayment: number;
  unreadMessages: number;
  unreadConversations: number;
  recentlyReplied: Array<{
    id: string;
    name: string;
    contact?: string | null;
    status: LeadStatus;
    lastInboundAt?: string | null;
  }>;
  latestUnread: Array<{
    phone: string;
    unreadCount: number;
    lastMessagePreview?: string | null;
    lastMessageAt?: string | null;
    lastStatus?: string | null;
    lead?: {
      id: string;
      name: string;
      status: LeadStatus;
    } | null;
  }>;
  pipeline: Record<string, number>;
  onboarding: {
    hasConnectedWhatsApp: boolean;
    connectedDisplayPhone?: string | null;
    hasLeads: boolean;
    hasSentFollowUp: boolean;
    totalLeads: number;
    sentMessagesCount: number;
  };
  waitingPaymentAmount?: number;
  onboardingProgressPercent?: number;
  calculationNote?: string;
  kpiTrend?: {
    todayTasks: number;
    unreadMessages: number;
    overdueFollowUps: number;
    payments: number;
  };
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

export interface AiGenerationResult {
  text: string;
  variants: string[];
  cutoffSummary?: string | null;
  memorySummary?: string | null;
  memoryGoal?: string | null;
  debug?: AiGenerationDebug;
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
  messageType?: string;
  transcriptionStatus?: 'pending' | 'success' | 'failed' | 'not_applicable';
  transcriptionError?: string | null;
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
  unreadCount: number;
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

export interface WhatsAppSendPreflight {
  connected: boolean;
  active: boolean;
  verified: boolean;
  hasRecentInbound: boolean;
  canSendFreeform: boolean;
  reasonCode:
    | 'OK'
    | 'WA_SETUP_REQUIRED'
    | 'WA_AUTH_REQUIRED'
    | 'WA_CONNECTION_NOT_READY'
    | 'WA_PROVIDER_NOT_READY'
    | 'WA_PHONE_INVALID'
    | 'WA_MESSAGE_INVALID'
    | 'WHATSAPP_NOT_CONNECTED'
    | 'WHATSAPP_INACTIVE'
    | 'WHATSAPP_NOT_VERIFIED'
    | 'WHATSAPP_TEMPLATE_REQUIRED';
  reasonMessage: string;
  send_ready: boolean;
  checks: {
    connection_ready: boolean;
    provider_ready: boolean;
    phone_valid: boolean;
    message_valid: boolean;
  };
  blocking_reasons: string[];
  recommended_action: 'reconnect' | 'reauth' | 'fix_phone' | 'edit_message' | 'complete_setup' | 'send_test' | 'wait_for_reply' | 'none';
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

  updateCurrentUser: async (data: {
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
  }): Promise<ApiResponse<User>> => {
    try {
      const response = await api.put<ApiResponse<User>>('/auth/me', data);
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
    stage?: string;
    tags?: string[];
    closedReason?: string;
    nextFollowUpAt?: string;
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
      stage?: string;
      tags?: string[];
      closedReason?: string;
      nextFollowUpAt?: string | null;
    }
  ): Promise<ApiResponse<Lead>> => {
    const response = await api.put<ApiResponse<Lead>>(`/leads/${id}`, data);
    return response.data;
  },

  updateLeadStatus: async (id: string, status: LeadStatus): Promise<ApiResponse<Lead>> => {
    const response = await api.put<ApiResponse<Lead>>(`/leads/${id}/status`, { status });
    return response.data;
  },

  importLeads: async (data: {
    csvText?: string;
    rows?: Array<{
      name: string;
      contact?: string;
      notes?: string;
      status?: LeadStatus;
    }>;
  }): Promise<ApiResponse<{
    created: Lead[];
    importedCount: number;
    skippedCount: number;
    totalRows: number;
    plan: UserPlan;
  }>> => {
    const response = await api.post<ApiResponse<{
      created: Lead[];
      importedCount: number;
      skippedCount: number;
      totalRows: number;
      plan: UserPlan;
    }>>('/leads/import', data);
    return response.data;
  },

  refreshMemory: async (
    id: string,
    language?: AppLanguage
  ): Promise<ApiResponse<{
    lead: Lead;
    memory: {
      summary?: string | null;
      goal?: string | null;
      tone?: AiTone | null;
      conversationMode?: ConversationMode | null;
      emojiDensity?: EmojiDensity | null;
      outputFormat?: OutputFormat | null;
      language?: AppLanguage | null;
      updatedAt?: string | null;
    };
  }>> => {
    const response = await api.post<ApiResponse<{
      lead: Lead;
      memory: {
        summary?: string | null;
        goal?: string | null;
        tone?: AiTone | null;
        conversationMode?: ConversationMode | null;
        emojiDensity?: EmojiDensity | null;
        outputFormat?: OutputFormat | null;
        language?: AppLanguage | null;
        updatedAt?: string | null;
      };
    }>>(`/leads/${id}/memory/refresh`, { language });
    return response.data;
  },

  exportCsv: async (params?: {
    status?: LeadStatus;
    stage?: string;
    tag?: string;
    q?: string;
  }): Promise<Blob> => {
    const response = await api.get('/leads/export.csv', {
      params,
      responseType: 'blob',
    });
    return response.data as Blob;
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

  getDispatchLogs: async (
    limit: number = 30,
    status?: 'sent' | 'failed' | 'requires_template' | 'skipped'
  ): Promise<ApiResponse<ReminderDispatchLog[]>> => {
    const response = await api.get<ApiResponse<ReminderDispatchLog[]>>('/reminders/dispatch-logs', { params: { limit, status } });
    return response.data;
  },

  runDispatchNow: async (): Promise<ApiResponse<{ scanned: number; processed: number }>> => {
    const response = await api.post<ApiResponse<{ scanned: number; processed: number }>>('/reminders/dispatch/run');
    return response.data;
  },

  retryDispatchLog: async (id: string): Promise<ApiResponse<{ retried: boolean; status: string; reason?: string }>> => {
    const response = await api.post<ApiResponse<{ retried: boolean; status: string; reason?: string }>>(`/reminders/dispatch-logs/${id}/retry`);
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
    variantCount?: number;
  }): Promise<ApiResponse<AiGenerationResult>> => {
    const response = await api.post<ApiResponse<AiGenerationResult>>('/ai/follow-up', data);
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
    variantCount?: number;
  }): Promise<ApiResponse<AiGenerationResult>> => {
    const response = await api.post<ApiResponse<AiGenerationResult>>('/ai/payment', data);
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

  getPreflight: async (phone?: string, message?: string): Promise<ApiResponse<WhatsAppSendPreflight>> => {
    const response = await api.get<ApiResponse<WhatsAppSendPreflight>>('/whatsapp/preflight', {
      params: {
        ...(phone ? { phone } : {}),
        ...(message ? { message } : {}),
      },
    });
    return response.data;
  },

  sendText: async (data: {
    toPhone: string;
    content: string;
    leadId?: string;
    conversationPhone?: string;
    clientMessageId?: string;
  }): Promise<ApiResponse<{ sent: boolean; messageId?: string; serverMessageId?: string; clientMessageId?: string | null; toPhone: string; deduped?: boolean }>> => {
    const response = await api.post<ApiResponse<{ sent: boolean; messageId?: string; serverMessageId?: string; clientMessageId?: string | null; toPhone: string; deduped?: boolean }>>('/whatsapp/send', data);
    return response.data;
  },

  sendMedia: async (data: {
    toPhone: string;
    leadId?: string;
    conversationPhone?: string;
    clientMessageId?: string;
    mediaType: 'image' | 'document';
    mediaUrl: string;
    caption?: string;
    filename?: string;
  }): Promise<ApiResponse<{ sent: boolean; messageId?: string; serverMessageId?: string; clientMessageId?: string | null; toPhone: string; deduped?: boolean }>> => {
    const response = await api.post<ApiResponse<{ sent: boolean; messageId?: string; serverMessageId?: string; clientMessageId?: string | null; toPhone: string; deduped?: boolean }>>('/whatsapp/send-media', data);
    return response.data;
  },

  sendMediaUpload: async (data: {
    toPhone: string;
    leadId?: string;
    conversationPhone?: string;
    clientMessageId?: string;
    mediaType?: 'image' | 'document';
    caption?: string;
    filename?: string;
    file: File;
  }): Promise<ApiResponse<{ sent: boolean; messageId?: string; serverMessageId?: string; clientMessageId?: string | null; toPhone: string; deduped?: boolean }>> => {
    const formData = new FormData();
    formData.append('toPhone', data.toPhone);
    if (data.leadId) formData.append('leadId', data.leadId);
    if (data.conversationPhone) formData.append('conversationPhone', data.conversationPhone);
    if (data.clientMessageId) formData.append('clientMessageId', data.clientMessageId);
    if (data.mediaType) formData.append('mediaType', data.mediaType);
    if (data.caption) formData.append('caption', data.caption);
    if (data.filename) formData.append('filename', data.filename);
    formData.append('file', data.file);

    const response = await api.post<ApiResponse<{ sent: boolean; messageId?: string; serverMessageId?: string; clientMessageId?: string | null; toPhone: string; deduped?: boolean }>>(
      '/whatsapp/send-media-upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
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

  markConversationRead: async (phone: string): Promise<ApiResponse<{ id: string; unreadCount: number }>> => {
    const response = await api.post<ApiResponse<{ id: string; unreadCount: number }>>('/whatsapp/conversations/read', { phone });
    return response.data;
  },
};

export const dashboardApi = {
  getSummary: async (): Promise<ApiResponse<DashboardSummary>> => {
    const response = await api.get<ApiResponse<DashboardSummary>>('/dashboard/summary');
    return response.data;
  },

  getSummaryV2: async (): Promise<ApiResponse<DashboardSummary>> => {
    const response = await api.get<ApiResponse<DashboardSummary>>('/dashboard/summary-v2');
    return response.data;
  },
};

export default api;
