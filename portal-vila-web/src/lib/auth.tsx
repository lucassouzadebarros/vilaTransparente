import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, storedToken, storeToken, whenSessionExpires, type PlatformMe } from './api';

type Session =
  | { status: 'checking' }
  | { status: 'signed-out'; notice?: string }
  | { status: 'signed-in'; me: PlatformMe };

type Auth = {
  session: Session;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (notice?: string) => void;
};

const AuthContext = createContext<Auth | null>(null);

export const NO_ACCESS = 'Esta conta não tem acesso ao painel da plataforma. Ele é só para quem administra a plataforma.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(() => (storedToken() ? { status: 'checking' } : { status: 'signed-out' }));

  const signOut = useCallback((notice?: string) => {
    storeToken(null);
    setSession({ status: 'signed-out', notice });
  }, []);

  useEffect(() => {
    whenSessionExpires(() => signOut('Sua sessão expirou. Entre de novo.'));
    if (!storedToken()) return;
    api
      .me()
      .then((me) => setSession({ status: 'signed-in', me }))
      .catch(() => signOut());
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const login = await api.login(email.trim(), password);
    storeToken(login.token);
    try {
      const me = await api.me();
      setSession({ status: 'signed-in', me });
    } catch (error) {
      storeToken(null);
      if (error instanceof ApiError && error.status === 403) throw new ApiError(403, NO_ACCESS);
      throw error;
    }
  }, []);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth fora do AuthProvider');
  return auth;
}
