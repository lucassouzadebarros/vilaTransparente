import { Building2, ShieldCheck, Vote } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import logo from '@/logo.png';
import { Button, Input, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const highlights = [
  { icon: Building2, text: 'Todos os condomínios atendidos, num só lugar.' },
  { icon: ShieldCheck, text: 'Os dados de cada condomínio ficam separados dos outros.' },
  { icon: Vote, text: 'Transparência, orçamentos e votação para os moradores.' }
];

export function LoginPage() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status === 'signed-in') return <Navigate to="/condominios" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  const notice = session.status === 'signed-out' ? session.notice : undefined;

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-ink lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="size-10 rounded-xl" />
          <span className="text-lg font-semibold">Portal da Vila</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Painel da plataforma</h1>
          <p className="mt-3 text-sidebar-muted">A gestão dos condomínios que usam o Portal da Vila.</p>
          <ul className="mt-10 space-y-5">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sidebar-active">
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="pt-1.5 text-sm text-sidebar-ink/90">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sidebar-muted">Acesso restrito a quem administra a plataforma.</p>
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src={logo} alt="" className="size-10 rounded-xl" />
            <div>
              <p className="font-semibold">Portal da Vila</p>
              <p className="text-sm text-muted">Painel da plataforma</p>
            </div>
          </div>
          <h2 className="text-2xl font-semibold">Entrar</h2>
          <p className="mt-1 text-sm text-muted">Use a mesma conta do aplicativo.</p>

          {(error || notice) && (
            <div role="alert" className="mt-6 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
              {error ?? notice}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                E-mail
              </label>
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Senha
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !email || !password}>
              {busy && <Spinner />}
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
