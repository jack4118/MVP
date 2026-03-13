const TOKEN_KEY = 'auth_token';

export const storage = {
  getToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken: (token: string): void => {
    localStorage.setItem(TOKEN_KEY, token);
  },

  removeToken: (): void => {
    localStorage.removeItem(TOKEN_KEY);
  },

  getItem: (key: string): string | null => {
    return localStorage.getItem(key);
  },

  setItem: (key: string, value: string): void => {
    localStorage.setItem(key, value);
  },

  removeItem: (key: string): void => {
    localStorage.removeItem(key);
  },

  getJson: <T>(key: string, fallback: T): T => {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    try {
      return JSON.parse(raw) as T;
    } catch (_err) {
      return fallback;
    }
  },

  setJson: (key: string, value: unknown): void => {
    localStorage.setItem(key, JSON.stringify(value));
  },
};
