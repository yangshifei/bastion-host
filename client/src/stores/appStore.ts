import { create } from 'zustand';

interface AppState {
  sidebarCollapsed: boolean;
  theme: 'dark' | 'light';
  globalSearchOpen: boolean;
}

interface AppActions {
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setGlobalSearchOpen: (open: boolean) => void;
}

export type AppStore = AppState & AppActions;

export const useAppStore = create<AppStore>((set) => ({
  sidebarCollapsed: false,
  theme: 'dark',
  globalSearchOpen: false,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setTheme: (theme) => set({ theme }),
  setGlobalSearchOpen: (open) => set({ globalSearchOpen: open }),
}));
