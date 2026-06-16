import { create } from 'zustand';

const THEME_KEY = 'volcano_theme';

function getStoredTheme(): 'dark' | 'light' {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

interface ThemeState {
  theme: 'dark' | 'light';
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getStoredTheme(),
  toggle: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      document.documentElement.classList.toggle('light', next === 'light');
      return { theme: next };
    }),
}));
