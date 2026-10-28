import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, mayUsePanel, storedToken, storeToken, whenSessionExpires, type Session } from './api';

type SessionState =
  | { status: 'checking' }
  | { status: 'signed-out'; notice?: string }
  | { status: 'signed-in'; me: Session };

type Auth = {
  session: SessionState;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (notice?: string) => void;
  /** Reads the session again (after the condominium's name changes, say). */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export const NO_ACCESS =
  'Este painel é para quem administra a plataforma ou um condomínio. Moradores usam o aplicativo do Portal da Vila.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>(() => (storedToken() ? { status: 'checking' } : { status: 'signed-out' }));
  const queryClient = useQueryClient();

  // Whatever the previous account loaded (its condominium's settings, say) must never show for the next one.
  const signOut = useCallback(
    (notice?: string) => {
      storeToken(null);
      queryClient.clear();
      setSession({ status: 'signed-out', notice });
    },
    [queryClient]
  );

  const load = useCallback(async () => {
    const me = await api.session();
    if (!mayUsePanel(me)) throw new ApiError(403, NO_ACCESS);
    setSession({ status: 'signed-in', me });
  }, []);

  useEffect(() => {
    whenSessionExpires(() => signOut('Sua sessão expirou. Entre de novo.'));
    if (!storedToken()) return;
    load().catch(() => signOut());
  }, [load, signOut]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const login = await api.login(email.trim(), password);
      storeToken(login.token);
      queryClient.clear();
      try {
        await load();
      } catch (error) {
        storeToken(null);
        throw error;
      }
    },
    [load, queryClient]
  );

  const refresh = useCallback(() => load().catch(() => undefined), [load]);

  const value = useMemo(() => ({ session, signIn, signOut, refresh }), [session, signIn, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth fora do AuthProvider');
  return auth;
}

/** The signed-in account; only for pages behind the session guard. */
export function useSession() {
  const { session } = useAuth();
  if (session.status !== 'signed-in') throw new Error('useSession sem sessão');
  return session.me;
}
