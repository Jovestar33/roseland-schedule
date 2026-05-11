import { create } from 'zustand';
import { AUTH_TOKEN_KEY } from '../constants';
import { postAuth } from '../api/auth';

// Lightweight cookie that middleware reads for server-side auth redirect.
// Contains no sensitive data — the real HMAC token is in sessionStorage.
const AUTH_COOKIE = 'rp_auth_flag';
const COOKIE_MAX_AGE = 8 * 60 * 60; // 8 hours (one workday)

function setAuthCookie() {
  document.cookie = `${AUTH_COOKIE}=1; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=lax`;
}

function clearAuthCookie() {
  document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; SameSite=lax`;
}

interface AuthStore {
  token: string | null;
  isAuthenticated: boolean;
  /** true once sessionStorage has been read; guards against flash redirect on first render */
  hydrated: boolean;
  hydrate: () => void;
  login: (password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  isAuthenticated: false,
  hydrated: false,

  hydrate() {
    if (typeof window === 'undefined') return;
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
    set({ token: token ?? null, isAuthenticated: !!token, hydrated: true });
  },

  async login(password: string) {
    const result = await postAuth(password);
    if (result.ok && result.token) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(AUTH_TOKEN_KEY, result.token);
        setAuthCookie();
      }
      set({ token: result.token, isAuthenticated: true, hydrated: true });
      return { ok: true };
    }
    return { ok: false, error: result.error ?? 'Login failed' };
  },

  logout() {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      clearAuthCookie();
    }
    set({ token: null, isAuthenticated: false });
  },
}));
