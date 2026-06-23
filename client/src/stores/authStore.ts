import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SafeUser } from '../types';

interface AuthState {
  token: string | null;
  user: SafeUser | null;
  _hasHydrated: boolean;
}

interface AuthActions {
  login: (token: string, user: SafeUser) => void;
  logout: () => void;
  setUser: (user: SafeUser) => void;
  setHydrated: () => void;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      _hasHydrated: false,

      login: (token: string, user: SafeUser) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      setUser: (user: SafeUser) => set({ user }),
      setHydrated: () => set({ _hasHydrated: true }),
    }),
    {
      name: 'bastion-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Mark hydration complete after persist restores state
          state._hasHydrated = true;
        }
        // Ensure the setHydrated runs even if state was empty
        if (!state) {
          useAuthStore.setState({ _hasHydrated: true });
        }
      },
    }
  )
);
