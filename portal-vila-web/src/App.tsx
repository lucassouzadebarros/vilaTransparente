import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ActivatePage } from '@/pages/ActivatePage';
import { CondominiumDetailPage } from '@/pages/CondominiumDetailPage';
import { CondominiumsPage } from '@/pages/CondominiumsPage';
import { LoginPage } from '@/pages/LoginPage';
import { RequestPage } from '@/pages/RequestPage';
import { RequestsPage } from '@/pages/RequestsPage';

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
      {/* Open to anyone: ask for a condominium, activate the account of a new one's síndico. */}
      <Route path="/cadastrar" element={<RequestPage />} />
      <Route path="/ativar" element={<ActivatePage />} />
      <Route
        element={
          <RequireSession>
            <AppShell />
          </RequireSession>
        }
      >
        <Route index element={<Navigate to="/condominios" replace />} />
        <Route path="/condominios" element={<CondominiumsPage />} />
        <Route path="/condominios/:id" element={<CondominiumDetailPage />} />
        <Route path="/pedidos" element={<RequestsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
