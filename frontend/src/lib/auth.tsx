import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  login: (name: string, password: string) => Promise<void>;
  register: (name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  // On load, determine setup state and whether there's an active session.
  useEffect(() => {
    Promise.all([
      api.get<{ needsSetup: boolean }>('/auth/status').catch(() => ({ needsSetup: false })),
      api.get<User>('/auth/me').catch(() => null),
    ])
      .then(([status, me]) => {
        setNeedsSetup(status.needsSetup);
        setUser(me);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (name: string, password: string) => {
    const me = await api.post<User>('/auth/login', { name, password });
    setUser(me);
    setNeedsSetup(false);
  };

  const register = async (name: string, password: string) => {
    const me = await api.post<User>('/auth/register', { name, password });
    setUser(me);
    setNeedsSetup(false);
  };

  const logout = async () => {
    await api.post('/auth/logout', {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, needsSetup, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
