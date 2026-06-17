import { create } from 'zustand';
import type { App } from '@/types';
import { api } from '@/lib/api';

interface StudioState {
  apps: App[];
  loading: boolean;
  error: string | null;
  loadApps: (all?: boolean) => Promise<void>;
  createApp: (payload: { name: string; icon?: string; description?: string }) => Promise<App>;
  updateApp: (id: number, data: { name?: string; icon?: string; description?: string; config_json?: string; api_enabled?: boolean }) => Promise<void>;
  deleteApp: (id: number) => Promise<void>;
  toggleStatus: (id: number) => Promise<void>;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  apps: [],
  loading: false,
  error: null,

  loadApps: async (all?: boolean) => {
    set({ loading: true, error: null });
    try {
      const apps = await api.listApps(all);
      set({ apps, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  createApp: async (payload) => {
    const created = await api.createApp(payload);
    set((state) => ({ apps: [created, ...state.apps] }));
    return created;
  },

  updateApp: async (id, data) => {
    const updated = await api.updateApp(id, data);
    set((state) => ({
      apps: state.apps.map((a) =>
        a.id === id ? updated : a
      ),
    }));
  },

  deleteApp: async (id) => {
    const previous = get().apps;
    set((state) => ({ apps: state.apps.filter((a) => a.id !== id) }));
    try {
      await api.deleteApp(id);
    } catch (e) {
      set({ apps: previous, error: e instanceof Error ? e.message : String(e) });
    }
  },

  toggleStatus: async (id) => {
    const target = get().apps.find((a) => a.id === id);
    if (!target) return;
    await api.toggleAppStatus(id);
    const newStatus = target.status === 'draft' ? 'published' : 'draft';
    set((state) => ({
      apps: state.apps.map((a) =>
        a.id === id ? { ...a, status: newStatus } : a
      ),
    }));
  },
}));
