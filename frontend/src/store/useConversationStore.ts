import { create } from 'zustand';
import type { Conversation, ChatMessage } from '@/types';
import { api } from '@/lib/api';

interface ConversationState {
  conversations: Conversation[];
  currentConvId: number | null;
  messages: ChatMessage[];
  loading: boolean;

  loadConversations: (appId: number) => Promise<void>;
  createConversation: (appId: number) => Promise<Conversation>;
  selectConversation: (convId: number) => Promise<void>;
  deleteConversation: (convId: number, appId: number) => Promise<void>;
  addMessages: (convId: number, msgs: { role: string; content: string }[]) => Promise<void>;
  updateTitle: (convId: number, title: string) => Promise<void>;
  updateSummary: (convId: number, summary: string) => Promise<void>;
  reset: () => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  currentConvId: null,
  messages: [],
  loading: false,

  loadConversations: async (appId: number) => {
    set({ loading: true });
    try {
      const conversations = await api.listConversations(appId);
      set({ conversations, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createConversation: async (appId: number) => {
    const conv = await api.createConversation(appId);
    set((state) => ({
      conversations: [conv, ...state.conversations],
      currentConvId: conv.id,
      messages: [],
    }));
    return conv;
  },

  selectConversation: async (convId: number) => {
    set({ currentConvId: convId, loading: true });
    try {
      const messages = await api.listMessages(convId);
      set({ messages, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  deleteConversation: async (convId: number, _appId: number) => {
    await api.deleteConversation(convId);
    const { currentConvId } = get();
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== convId),
      currentConvId: currentConvId === convId ? null : currentConvId,
      messages: currentConvId === convId ? [] : state.messages,
    }));
  },

  addMessages: async (convId: number, msgs: { role: string; content: string }[]) => {
    const saved = await api.addMessages(convId, msgs);
    set((state) => ({
      messages: [...state.messages, ...saved.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))],
    }));
    const conv = get().conversations.find((c) => c.id === convId);
    if (conv) {
      conv.message_count += msgs.length;
      // Auto-set title from first user message
      if (!conv.title) {
        const firstUser = msgs.find((m) => m.role === 'user');
        if (firstUser) {
          const simplified = firstUser.content
            .replace(/[\n\r]+/g, ' ')
            .replace(/[，。！？、；：.!,?;:]+$/, '')
            .trim()
            .slice(0, 30);
          if (simplified) {
            conv.title = simplified;
            try {
              await api.updateConversation(convId, { title: simplified });
            } catch { /* ignore */ }
          }
        }
      }
      set({ conversations: [...get().conversations] });
    }
  },

  updateTitle: async (convId: number, title: string) => {
    await api.updateConversation(convId, { title });
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, title } : c
      ),
    }));
  },

  updateSummary: async (convId: number, summary: string) => {
    await api.updateConversation(convId, { summary });
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, summary } : c
      ),
    }));
  },

  reset: () => {
    set({ conversations: [], currentConvId: null, messages: [], loading: false });
  },
}));
