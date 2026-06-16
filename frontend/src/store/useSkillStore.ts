import { create } from 'zustand';
import type { Skill } from '@/types';
import { api, type SkillOut } from '@/lib/api';

function mapSkill(s: SkillOut): Skill {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    content: s.content,
    filename: s.filename,
    ownerId: s.owner_id,
    ownerUsername: s.owner_username ?? undefined,
    createdAt: (() => { try { return new Date(s.created_at).toLocaleString('zh-CN'); } catch { return s.created_at; } })(),
    updatedAt: (() => { try { return new Date(s.updated_at).toLocaleString('zh-CN'); } catch { return s.updated_at; } })(),
  };
}

interface SkillState {
  skills: Skill[];
  loading: boolean;
  error: string | null;
  loadSkills: () => Promise<void>;
  createSkill: (name: string, content: string, description?: string) => Promise<void>;
  uploadSkillFile: (file: File) => Promise<void>;
  updateSkill: (id: number, data: { name?: string; description?: string; content?: string }) => Promise<void>;
  deleteSkill: (id: number) => Promise<void>;
}

export const useSkillStore = create<SkillState>((set) => ({
  skills: [],
  loading: false,
  error: null,

  loadSkills: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.listSkills();
      set({ skills: data.map(mapSkill), loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  createSkill: async (name: string, content: string, description?: string) => {
    const data = await api.createSkill(name, content, description);
    set((state) => ({ skills: [mapSkill(data), ...state.skills] }));
  },

  uploadSkillFile: async (file: File) => {
    const data = await api.uploadSkillFile(file);
    set((state) => ({ skills: [mapSkill(data), ...state.skills] }));
  },

  updateSkill: async (id: number, data: { name?: string; content?: string }) => {
    const result = await api.updateSkill(id, data);
    set((state) => ({
      skills: state.skills.map((s) => (s.id === id ? mapSkill(result) : s)),
    }));
  },

  deleteSkill: async (id: number) => {
    const previous = useSkillStore.getState().skills;
    set((state) => ({ skills: state.skills.filter((s) => s.id !== id) }));
    try {
      await api.deleteSkill(id);
    } catch {
      set({ skills: previous });
    }
  },
}));
