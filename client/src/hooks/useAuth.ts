import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const { token, user, _hasHydrated, login, logout, setUser } = useAuthStore();

  return {
    isAuthenticated: !!token && !!user,
    isLoading: !_hasHydrated,
    user,
    token,
    isAdmin: user?.role === 'admin',
    isAuditor: user?.role === 'auditor',
    isOperator: user?.role === 'operator',
    login,
    logout,
    setUser,
  };
}
