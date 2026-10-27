import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { CondominiumsPage } from '@/pages/CondominiumsPage';
import { LoginPage } from '@/pages/LoginPage';

function RequireSession({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (session.status === 'checking') {
    return (
      <div className="grid min-h-screen place-items-center text-muted" role="status">
        <span className="flex items-center gap-2 text-sm">
          <Spinner /> Abrindo o painel…
        </span>
      </div>
    );
  }
  if (session.status === 'signed-out') return <Navigate to="/entrar" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route
        element={
          <RequireSession>
            <AppShell />
          </RequireSession>
        }
      >
        <Route index element={<Navigate to="/condominios" replace />} />
        <Route path="/condominios" element={<CondominiumsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
