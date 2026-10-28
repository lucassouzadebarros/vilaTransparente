import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { Spinner } from '@/components/ui';
import { administersCondominium, managesCondominium } from '@/lib/api';
import { useAuth, useSession } from '@/lib/auth';
import { ActivatePage } from '@/pages/ActivatePage';
import { BillingPage } from '@/pages/BillingPage';
import { CondoOverviewPage } from '@/pages/CondoOverviewPage';
import { CondoSettingsPage } from '@/pages/CondoSettingsPage';
import { CondominiumDetailPage } from '@/pages/CondominiumDetailPage';
import { CondominiumsPage } from '@/pages/CondominiumsPage';
import { LoginPage } from '@/pages/LoginPage';
import { PayablesPage } from '@/pages/PayablesPage';
import { SuppliersPage } from '@/pages/SuppliersPage';
import { ReadingsPage } from '@/pages/ReadingsPage';
import { RequestPage } from '@/pages/RequestPage';
import { RequestsPage } from '@/pages/RequestsPage';
import { UnitsPage } from '@/pages/UnitsPage';

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

/** Where each account starts: its own condominium, its bills for the síndico, or the platform for whoever only runs it. */
function Home() {
  const me = useSession();
  return <Navigate to={administersCondominium(me) ? '/condominio' : managesCondominium(me) ? '/condominio/contas' : '/condominios'} replace />;
}

/** The administration and the síndico. */
function OnlyManagers({ children }: { children: ReactNode }) {
  const me = useSession();
  return managesCondominium(me) ? children : <Navigate to="/" replace />;
}

function OnlyPlatform({ children }: { children: ReactNode }) {
  const me = useSession();
  return me.platformAdmin ? children : <Navigate to="/" replace />;
}

function OnlyCondominium({ children }: { children: ReactNode }) {
  const me = useSession();
  return administersCondominium(me) ? children : <Navigate to="/" replace />;
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
        <Route index element={<Home />} />
        <Route path="/condominio" element={<OnlyCondominium><CondoOverviewPage /></OnlyCondominium>} />
        <Route path="/condominio/unidades" element={<OnlyCondominium><UnitsPage /></OnlyCondominium>} />
        <Route path="/condominio/cobrancas" element={<OnlyCondominium><BillingPage /></OnlyCondominium>} />
        <Route path="/condominio/consumo" element={<OnlyCondominium><ReadingsPage /></OnlyCondominium>} />
        <Route path="/condominio/contas" element={<OnlyManagers><PayablesPage /></OnlyManagers>} />
        <Route path="/condominio/fornecedores" element={<OnlyManagers><SuppliersPage /></OnlyManagers>} />
        <Route path="/condominio/configuracoes" element={<OnlyCondominium><CondoSettingsPage /></OnlyCondominium>} />
        <Route path="/condominios" element={<OnlyPlatform><CondominiumsPage /></OnlyPlatform>} />
        <Route path="/condominios/:id" element={<OnlyPlatform><CondominiumDetailPage /></OnlyPlatform>} />
        <Route path="/pedidos" element={<OnlyPlatform><RequestsPage /></OnlyPlatform>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
