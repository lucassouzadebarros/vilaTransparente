import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Eye, EyeOff, KeyRound, Link2, ServerCog, ShieldCheck, Unplug } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { FormAlert } from '@/components/PublicLayout';
import { Badge, Button, Input, Skeleton, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { api, type PaymentsStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatWhen } from '@/lib/utils';

const ASAAS_SITE = 'https://www.asaas.com';
const ASAAS_KEY_HELP = 'https://docs.asaas.com/docs/chaves-de-api';

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
      {children}
      <ExternalLink aria-hidden className="size-3.5" />
    </a>
  );
}

/** Pasting the key: checked with Asaas before anything is kept, and the notices set up in the same step. */
function KeyForm({ submitLabel, onCancel, onConnected }: { submitLabel: string; onCancel?: () => void; onConnected: (status: PaymentsStatus) => void }) {
  const [key, setKey] = useState('');
  const [visible, setVisible] = useState(false);
  const connect = useMutation({ mutationFn: () => api.connectAsaas(key.trim()), onSuccess: onConnected });
  const tooShort = key.trim().length < 20;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!tooShort) connect.mutate();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {connect.isError && <FormAlert>{connect.error.message}</FormAlert>}
      <div className="space-y-1.5">
        <label htmlFor="chave-asaas" className="block text-sm font-medium text-ink">
          Chave de API do Asaas
        </label>
        <div className="relative">
          <KeyRound aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            id="chave-asaas"
            type={visible ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder="$aact_..."
            className="pl-9 pr-11 font-mono"
            value={key}
            onChange={(event) => setKey(event.target.value)}
          />
          <button
            type="button"
            onClick={() => setVisible((shown) => !shown)}
            aria-label={visible ? 'Esconder a chave' : 'Mostrar a chave'}
            aria-pressed={visible}
            className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-ink"
          >
            {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        </div>
        <p className="text-xs text-muted">Começa com $aact_. Cole a chave inteira, do jeito que o Asaas mostrou.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={connect.isPending || tooShort}>
          {connect.isPending ? <Spinner /> : <Link2 aria-hidden className="size-4" />}
          {connect.isPending ? 'Conferindo com o Asaas…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={connect.isPending}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
        {number}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm font-medium">{title}</p>
        <div className="mt-1 space-y-3 text-sm text-muted">{children}</div>
      </div>
    </li>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * The condominium's own Asaas account: the money of the monthly fees lands there. Connecting is pasting one key; the
 * system checks it, keeps it sealed and tells Asaas where to send the payment notices.
 */
export function PixConnection() {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { refresh } = useAuth();
  const status = useQuery({ queryKey: ['condo', 'payments'], queryFn: api.paymentsStatus });
  const [replacing, setReplacing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function changed(next: PaymentsStatus) {
    queryClient.setQueryData(['condo', 'payments'], next);
    queryClient.invalidateQueries({ queryKey: ['condo', 'dashboard'] });
    refresh();
  }

  const disconnect = useMutation({
    mutationFn: api.disconnectAsaas,
    onSuccess: (next) => {
      setConfirming(false);
      changed(next);
      notify('ok', 'Conta Asaas desconectada.');
    }
  });

  if (status.isPending) return <Skeleton className="h-36 rounded-xl" />;

  if (status.isError) {
    return (
      <div className="space-y-3">
        <FormAlert>{status.error.message}</FormAlert>
        <Button variant="secondary" size="sm" onClick={() => status.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const current = status.data;

  if (current.source === 'SERVIDOR') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-ok/25 bg-ok-soft p-4 text-sm text-ok">
        <ServerCog aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">Conta Asaas conectada pela configuração do servidor.</strong> As cobranças por Pix e os avisos de
          pagamento já funcionam. A chave fica guardada no servidor da plataforma, por isso não aparece nem muda por aqui.
        </p>
      </div>
    );
  }

  if (current.connected) {
    return (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="flex items-start gap-3 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ok-soft text-ok">
              <CheckCircle2 aria-hidden className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{current.accountName ?? 'Conta Asaas'}</p>
              <p className="text-sm text-muted">Cobranças por Pix e avisos de pagamento funcionando.</p>
            </div>
            <Badge tone="ok">Conectada</Badge>
          </div>
          <dl className="grid gap-4 border-t border-line px-4 py-3.5 sm:grid-cols-3">
            <Detail label="Chave">
              <span className="font-mono">•••• {current.keyHint}</span>
            </Detail>
            <Detail label="Conectada em">{current.connectedAt ? formatDateTime(current.connectedAt) : '—'}</Detail>
            <Detail label="Último aviso do Asaas">{current.lastEventAt ? formatWhen(current.lastEventAt) : 'Nenhum ainda'}</Detail>
          </dl>
          {!replacing && (
            <div className="flex flex-wrap gap-2 border-t border-line bg-surface-alt/50 px-4 py-3">
              <Button variant="secondary" size="sm" onClick={() => setReplacing(true)}>
                <KeyRound aria-hidden className="size-4" />
                Trocar a chave
              </Button>
              <Button variant="danger-outline" size="sm" onClick={() => setConfirming(true)}>
                <Unplug aria-hidden className="size-4" />
                Desconectar
              </Button>
            </div>
          )}
        </div>

        {replacing && (
          <div className="rounded-xl border border-line bg-surface-alt/40 p-4">
            <p className="mb-3 text-sm text-muted">
              A chave nova substitui a atual, e o aviso de pagamentos passa para ela. Depois, apague a chave antiga no Asaas.
            </p>
            <KeyForm
              submitLabel="Trocar a chave"
              onCancel={() => setReplacing(false)}
              onConnected={(next) => {
                setReplacing(false);
                changed(next);
                notify('ok', 'Chave trocada. O aviso de pagamentos já usa a chave nova.');
              }}
            />
          </div>
        )}

        <Dialog
          open={confirming}
          onClose={() => !disconnect.isPending && setConfirming(false)}
          tone="danger"
          icon={<Unplug aria-hidden className="size-5" />}
          title="Desconectar a conta Asaas?"
          description="As cobranças por Pix param de sair e o sistema deixa de receber os avisos de pagamento desta conta. O que já foi pago continua registrado, e dá para conectar de novo quando quiser."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={disconnect.isPending} data-autofocus>
                Cancelar
              </Button>
              <Button variant="danger" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>
                {disconnect.isPending && <Spinner />}
                Desconectar
              </Button>
            </>
          }
        >
          {disconnect.isError && <FormAlert>{disconnect.error.message}</FormAlert>}
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Badge>Não conectado</Badge>
        <p className="text-sm text-muted">
          O dinheiro das mensalidades cai direto na conta Asaas do condomínio. Conecte uma vez e o sistema cuida do resto: cria as cobranças Pix
          e recebe os avisos de pagamento sozinho, sem nenhuma configuração no Asaas além da chave.
        </p>
      </div>

      <ol className="space-y-5">
        <Step number={1} title="Tenha uma conta Asaas no nome do condomínio">
          <p>
            É aberta com o CNPJ do condomínio. Se ainda não tem, crie em <TextLink href={ASAAS_SITE}>asaas.com</TextLink>.
          </p>
        </Step>
        <Step number={2} title="Gere uma chave de API">
          <p>
            No site do Asaas, entrando com um usuário administrador: menu do usuário, <strong className="font-medium text-ink">Integrações</strong>,{' '}
            <strong className="font-medium text-ink">Chaves de API</strong>, <strong className="font-medium text-ink">Gerar chave</strong>. Copie na
            hora: o Asaas mostra a chave uma vez só. <TextLink href={ASAAS_KEY_HELP}>Ajuda do Asaas</TextLink>
          </p>
        </Step>
        <Step number={3} title="Cole aqui e conecte">
          <KeyForm
            submitLabel="Conectar conta"
            onConnected={(next) => {
              changed(next);
              notify('ok', 'Conta Asaas conectada. O aviso de pagamentos já foi configurado.');
            }}
          />
        </Step>
      </ol>

      <p className="flex items-start gap-2 border-t border-line pt-4 text-xs text-muted">
        <ShieldCheck aria-hidden className="mt-px size-4 shrink-0 text-ok" />
        A chave fica guardada cifrada e não aparece de novo, nem para você. Para cortar o acesso a qualquer momento, desconecte aqui ou apague a
        chave no Asaas.
      </p>
    </div>
  );
}
