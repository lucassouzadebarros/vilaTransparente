import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { Session } from '../types';

type AuthContextValue = {
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  markPasswordChanged: () => Promise<void>;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('portal-vila-session').then(async (raw) => {
      if (!raw) {
        return;
      }
      let stored: Session;
      try {
        stored = JSON.parse(raw) as Session;
      } catch {
        await AsyncStorage.removeItem('portal-vila-session');
        return;
      }
      const tokenLooksReal = stored.token && stored.token.split('.').length === 3 && !stored.token.startsWith('offline-');
      if (!tokenLooksReal) {
        await AsyncStorage.removeItem('portal-vila-session');
        return;
      }
      setSession(stored);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const clearExpiredSession = () => setSession(null);
    window.addEventListener('portal-vila-auth-expired', clearExpiredSession);
    return () => window.removeEventListener('portal-vila-auth-expired', clearExpiredSession);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isAdmin: session?.role === 'ADMIN',
    async login(email: string, password: string) {
      await AsyncStorage.removeItem('portal-vila-session');
      setSession(null);
      const next = await api.login(email.trim(), password);
      await AsyncStorage.setItem('portal-vila-session', JSON.stringify(next));
      setSession(next);
    },
    async logout() {
      setSession(null);
      await AsyncStorage.removeItem('portal-vila-session');
    },
    async markPasswordChanged() {
      if (!session) {
        return;
      }
      const next = { ...session, mustChangePassword: false };
      await AsyncStorage.setItem('portal-vila-session', JSON.stringify(next));
      setSession(next);
    }
  }), [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  }
  return context;
}
