import axios, { AxiosError, AxiosInstance } from 'axios';
import { storage } from '../utils/storage';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
  };
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
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    // Only redirect to login if we're not already on the login page
    // and the error is not from a login/register request
    if (error.response?.status === 401 && !window.location.pathname.includes('/login')) {
      const isAuthRequest = error.config?.url?.includes('/auth/');
      if (!isAuthRequest) {
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
  status: string;
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
    status: string;
  };
}

export const authApi = {
  register: async (email: string, password: string): Promise<ApiResponse<User>> => {
    try {
      const response = await api.post<ApiResponse<User>>('/auth/register', {
        email,
        password,
      });
      return response.data;
    } catch (error: any) {
      // Return error response instead of throwing
      if (error.response?.data) {
        return error.response.data;
      }
      throw error;
    }
  },

  login: async (email: string, password: string): Promise<ApiResponse<LoginResponse>> => {
    try {
      const response = await api.post<ApiResponse<LoginResponse>>('/auth/login', {
        email,
        password,
      });
      return response.data;
    } catch (error: any) {
      // Return error response instead of throwing
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
    status?: string;
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
      status?: string;
    }
  ): Promise<ApiResponse<Lead>> => {
    const response = await api.put<ApiResponse<Lead>>(`/leads/${id}`, data);
    return response.data;
  },

  updateLeadStatus: async (id: string, status: string): Promise<ApiResponse<Lead>> => {
    const response = await api.put<ApiResponse<Lead>>(`/leads/${id}/status`, { status });
    return response.data;
  },
};

export const remindersApi = {
  getTodayReminders: async (): Promise<ApiResponse<Reminder[]>> => {
    const response = await api.get<ApiResponse<Reminder[]>>('/reminders/today');
    return response.data;
  },

  markDone: async (id: string): Promise<ApiResponse<Reminder>> => {
    const response = await api.post<ApiResponse<Reminder>>(`/reminders/${id}/done`);
    return response.data;
  },
};

export const aiApi = {
  generateFollowUp: async (data: {
    leadId: string;
    leadName: string;
    status?: string;
    daysPassed?: number;
    tone?: string;
  }): Promise<ApiResponse<{ text: string }>> => {
    const response = await api.post<ApiResponse<{ text: string }>>('/ai/follow-up', data);
    return response.data;
  },

  generatePayment: async (data: {
    leadId: string;
    leadName: string;
    amount?: number;
    dueDate?: string;
    tone?: string;
  }): Promise<ApiResponse<{ text: string }>> => {
    const response = await api.post<ApiResponse<{ text: string }>>('/ai/payment', data);
    return response.data;
  },
};

export default api;

