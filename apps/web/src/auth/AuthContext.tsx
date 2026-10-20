import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, SESSION_EXPIRED_EVENT, tokenStorage } from '../lib/api';
import type { User } from '../lib/types';

type AuthState = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(tokenStorage.get()));

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    if (!tokenStorage.get()) return;
    apiFetch<{ user: User }>('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => tokenStorage.clear())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, logout);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, logout);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    tokenStorage.set(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return context;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const homePathFor = (_user: User) => '/leads';
