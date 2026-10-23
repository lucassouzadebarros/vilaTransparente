import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { resetDemoState } from '../demo/demoAdapter';
import { demoSession, isDemoMode, startDemoMode, stopDemoMode } from '../demo/demoMode';
import { api, onAuthExpired } from '../services/api';
import { Role, Session } from '../types';
import { registerForPush } from '../utils/push';

type AuthContextValue = {
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  /** Opens the demonstration: example data, no account, nothing saved. Also switches between its two views. */
  enterDemo: (role: Role) => void;
  isDemo: boolean;
  logout: () => Promise<void>;
  markPasswordChanged: () => Promise<void>;
  isAdmin: boolean;
  isSindico: boolean;
  /** Admin or síndico: registers and manages budgets and their services. */
  canManageBudgets: boolean;
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

  // On a phone build, tell the server where to send notices. Nothing happens on the web.
  useEffect(() => {
    if (session?.token && !session.demo) {
      registerForPush().catch(() => undefined);
    }
  }, [session?.token, session?.demo]);

  useEffect(() => onAuthExpired(() => setSession(null)), []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    isAdmin: session?.role === 'ADMIN',
    isSindico: session?.role === 'SINDICO',
    canManageBudgets: session?.role === 'ADMIN' || session?.role === 'SINDICO',
    isDemo: Boolean(session?.demo),
    enterDemo(role: Role) {
      if (!isDemoMode()) {
        resetDemoState();
      }
      startDemoMode(role);
      setSession(demoSession(role));
    },
    async login(email: string, password: string) {
      stopDemoMode();
      await AsyncStorage.removeItem('portal-vila-session');
      setSession(null);
      const next = await api.login(email.trim(), password);
      await AsyncStorage.setItem('portal-vila-session', JSON.stringify(next));
      setSession(next);
    },
    async logout() {
      stopDemoMode();
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
