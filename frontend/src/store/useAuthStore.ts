import { create } from 'zustand';
import type { User } from '@/types';
import { api, getToken, setToken, removeToken } from '@/lib/api';

interface AuthState {
  currentUser: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  /** 供初始化时调用：如果有 token 就自动获取用户信息 */
  restore: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  token: getToken(),
  loading: false,

  login: async (username: string, password: string) => {
    set({ loading: true });
    try {
      const { access_token } = await api.login(username, password);
      setToken(access_token);
      set({ token: access_token, loading: false });
      // 登录成功后立即拉取用户信息
      const user = await api.getMe();
      set({ currentUser: user });
    } catch (e) {
      set({ loading: false });
      removeToken();
      throw e;
    }
  },

  logout: () => {
    removeToken();
    set({ currentUser: null, token: null });
    window.location.href = '/login';
  },

  fetchMe: async () => {
    try {
      const user = await api.getMe();
      set({ currentUser: user });
    } catch {
      set({ currentUser: null, token: null });
    }
  },

  restore: async () => {
    const token = getToken();
    if (!token) {
      set({ currentUser: null, token: null });
      return;
    }
    set({ token, loading: true });
    try {
      const user = await api.getMe();
      set({ currentUser: user, loading: false });
    } catch {
      removeToken();
      set({ currentUser: null, token: null, loading: false });
    }
  },
}));
