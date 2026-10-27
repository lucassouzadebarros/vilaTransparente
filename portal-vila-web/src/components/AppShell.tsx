import { Building2, LogOut, Menu, Monitor, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import logo from '@/logo.png';
import { useAuth } from '@/lib/auth';
import { useTheme, type ThemeChoice } from '@/lib/theme';
import { cn } from '@/lib/utils';

const sections = [
  {
    title: 'Plataforma',
    items: [{ to: '/condominios', label: 'Condomínios', icon: Building2 }]
  }
];

const themes: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'auto', label: 'Automático', icon: Monitor }
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { session, signOut } = useAuth();
  const me = session.status === 'signed-in' ? session.me : null;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-ink">
      <div className="flex items-center gap-3 px-5 py-5">
        <img src={logo} alt="" className="size-9 rounded-lg" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Portal da Vila</p>
          <p className="text-xs text-sidebar-muted">Painel da plataforma</p>
        </div>
      </div>

      <nav aria-label="Menu principal" className="flex-1 space-y-6 px-3 py-2">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">{section.title}</p>
            <ul className="space-y-1">
              {section.items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        isActive ? 'bg-sidebar-active font-medium text-white' : 'text-sidebar-muted hover:bg-sidebar-active/60 hover:text-sidebar-ink'
                      )
                    }
                  >
                    <Icon aria-hidden className="size-4" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        {me && (
          <div className="mb-3 min-w-0 px-1">
            <p className="truncate text-sm font-medium">{me.name}</p>
            <p className="truncate text-xs text-sidebar-muted">{me.email}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-active/60 hover:text-sidebar-ink"
        >
          <LogOut aria-hidden className="size-4" />
          Sair
        </button>
      </div>
    </div>
  );
}

function ThemeSwitch() {
  const { choice, choose } = useTheme();
  return (
    <div role="radiogroup" aria-label="Tema" className="flex rounded-lg border border-line bg-surface p-0.5">
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          title={label}
          onClick={() => choose(value)}
          className={cn(
            'grid size-8 place-items-center rounded-md transition-colors',
            choice === value ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink'
          )}
        >
          <Icon aria-hidden className="size-4" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

/** Menu on the left (a drawer on narrow screens), top bar with the theme, and the page. */
export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">
        <Sidebar />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-xl">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-3 top-5 grid size-8 place-items-center rounded-md text-sidebar-muted hover:text-sidebar-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      )}

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-8">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setDrawerOpen(true)}
            className="grid size-9 place-items-center rounded-lg border border-line bg-surface text-ink lg:hidden"
          >
            <Menu aria-hidden className="size-4" />
          </button>
          <div className="hidden text-sm text-muted lg:block">Gestão de condomínios</div>
          <ThemeSwitch />
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
