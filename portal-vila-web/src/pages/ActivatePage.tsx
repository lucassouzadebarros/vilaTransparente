import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Building2, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { FormAlert, PublicLayout } from '@/components/PublicLayout';
import { Button, Input, Spinner } from '@/components/ui';
import { Field } from '@/components/ui/page';
import { api, RESIDENTS_APP_URL, type ActivationPreview } from '@/lib/api';
import { cn } from '@/lib/utils';

const highlights = [
  { icon: KeyRound, text: 'O código vale uma vez só e expira em 7 dias.' },
  { icon: LockKeyhole, text: 'A senha é você quem cria. Ninguém mais a conhece.' },
  { icon: Smartphone, text: 'Depois é só entrar no aplicativo com o seu e-mail.' }
];

/** XXXX-XXXX while typing: letters and numbers only, the dash put in for you. */
function formatCode(raw: string) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

function strength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

const strengthLabels = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];

/** The síndico of a newly approved condominium: the code, then their own password, then the app. */
export function ActivatePage() {
  // The link carries the code after "#", which never reaches any server or log.
  const [code, setCode] = useState(() => formatCode(decodeURIComponent(window.location.hash.replace(/^#/, ''))));
  const [preview, setPreview] = useState<ActivationPreview | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const check = useMutation({ mutationFn: () => api.checkActivation(code), onSuccess: setPreview });
  const activate = useMutation({ mutationFn: () => api.activate(code, password) });

  useEffect(() => {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  }, []);

  const passwordError = password.length < 8 ? 'Use pelo menos 8 caracteres.' : null;
  const confirmationError = confirmation !== password ? 'As duas senhas não são iguais.' : null;
  const score = strength(password);

  function submitCode(event: FormEvent) {
    event.preventDefault();
    if (code.replace('-', '').length === 8) check.mutate();
  }

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!passwordError && !confirmationError) activate.mutate();
  }

  return (
    <PublicLayout
      documentTitle="Ativar conta"
      eyebrow="Ativação de conta"
      title="Bem-vindo ao Portal da Vila"
      lead="O seu condomínio foi aprovado. Falta só criar a sua senha."
      highlights={highlights}
      footnote="Não recebeu o código ou ele expirou? Peça um novo a quem administra a plataforma."
    >
      {activate.isSuccess ? (
        <div className="flex flex-col items-start">
          <span className="grid size-12 place-items-center rounded-2xl bg-ok-soft text-ok">
            <CheckCircle2 aria-hidden className="size-6" />
          </span>
          <h2 className="mt-5 text-2xl font-semibold">Conta ativada</h2>
          <p className="mt-2 text-sm text-muted">
            Agora entre no aplicativo com <strong className="font-medium text-ink">{activate.data.email}</strong> e a senha que você acabou de criar. Lá
            você cadastra os moradores, as despesas e acompanha tudo do condomínio.
          </p>
          <a
            href={RESIDENTS_APP_URL}
            className="mt-8 inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-on-brand hover:opacity-90"
          >
            Abrir o aplicativo <ArrowRight aria-hidden className="size-4" />
          </a>
        </div>
      ) : preview ? (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Building2 aria-hidden className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{preview.condominiumName}</p>
              <p className="truncate text-xs text-muted">
                {preview.name} · {preview.email}
              </p>
            </div>
          </div>
          <h2 className="mt-8 text-2xl font-semibold">Crie a sua senha</h2>
          <p className="mt-1 text-sm text-muted">É com ela e o seu e-mail que você vai entrar no aplicativo.</p>

          {activate.isError && (
            <div className="mt-6">
              <FormAlert>{activate.error.message}</FormAlert>
            </div>
          )}

          <form onSubmit={submitPassword} noValidate className="mt-6 space-y-4">
            <input type="email" autoComplete="username" value={preview.email} readOnly hidden />
            <Field label="Senha" htmlFor="senha" error={submitted ? passwordError : null}>
              <div className="relative">
                <Input
                  id="senha"
                  autoFocus
                  type={visible ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setVisible((current) => !current)}
                  aria-label={visible ? 'Esconder a senha' : 'Mostrar a senha'}
                  className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-ink"
                >
                  {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
                </button>
              </div>
            </Field>
            {password && (
              <div aria-live="polite" className="-mt-1 space-y-1.5">
                <div className="flex gap-1" aria-hidden>
                  {[0, 1, 2, 3].map((index) => (
                    <span
                      key={index}
                      className={cn(
                        'h-1 flex-1 rounded-full bg-line transition-colors',
                        index < score && (score <= 1 ? 'bg-danger' : score === 2 ? 'bg-warn' : 'bg-ok')
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted">Senha {strengthLabels[score].toLowerCase()}</p>
              </div>
            )}
            <Field label="Repita a senha" htmlFor="confirmacao" error={submitted ? confirmationError : null}>
              <Input
                id="confirmacao"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={activate.isPending}>
              {activate.isPending && <Spinner />}
              {activate.isPending ? 'Ativando…' : 'Ativar minha conta'}
            </Button>
          </form>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-semibold">Ativar conta</h2>
          <p className="mt-1 text-sm text-muted">Digite o código que você recebeu.</p>

          {check.isError && (
            <div className="mt-6">
              <FormAlert>{check.error.message}</FormAlert>
            </div>
          )}

          <form onSubmit={submitCode} className="mt-6 space-y-4">
            <Field label="Código de ativação" htmlFor="codigo" hint="São 8 letras e números, no formato ABCD-1234.">
              <Input
                id="codigo"
                autoFocus
                autoComplete="one-time-code"
                spellCheck={false}
                placeholder="ABCD-1234"
                className="h-12 text-center font-mono text-lg tracking-[0.3em]"
                value={code}
                onChange={(e) => setCode(formatCode(e.target.value))}
              />
            </Field>
            <Button type="submit" className="w-full" disabled={check.isPending || code.replace('-', '').length !== 8}>
              {check.isPending && <Spinner />}
              Continuar
            </Button>
          </form>
        </>
      )}
    </PublicLayout>
  );
}
