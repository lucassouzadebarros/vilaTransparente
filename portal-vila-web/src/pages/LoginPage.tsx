import { ArrowRight, ShieldCheck, Vote, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { FormAlert, PublicLayout } from '@/components/PublicLayout';
import { Button, Input, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const highlights = [
  { icon: Wallet, text: 'Cobrança, caixa e prestação de contas do condomínio, abertos aos moradores.' },
  { icon: Vote, text: 'Gastos grandes passam por orçamento e votação das unidades.' },
  { icon: ShieldCheck, text: 'Os dados de cada condomínio ficam separados dos outros.' }
];

export function LoginPage() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.status === 'signed-in') return <Navigate to="/" replace />;

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
    <PublicLayout
      documentTitle="Entrar"
      eyebrow="Gestão de condomínios"
      title="Painel de gestão"
      lead="Para quem administra um condomínio no Portal da Vila."
      highlights={highlights}
      footnote="Moradores usam o aplicativo do Portal da Vila."
    >
      <h2 className="text-2xl font-semibold">Entrar</h2>
      <p className="mt-1 text-sm text-muted">Use a mesma conta do aplicativo.</p>

      {(error || notice) && (
        <div className="mt-6">
          <FormAlert>{error ?? notice}</FormAlert>
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
      <p className="mt-6 text-center text-xs text-muted">Esqueceu a senha? Use “Esqueci minha senha” no aplicativo.</p>

      <div className="mt-10 rounded-xl border border-line bg-surface p-4">
        <p className="text-sm font-medium">Quer o Portal da Vila no seu condomínio?</p>
        <p className="mt-0.5 text-sm text-muted">Conte sobre ele e nós entramos em contato.</p>
        <Link to="/cadastrar" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
          Pedir o cadastro <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </PublicLayout>
  );
}
