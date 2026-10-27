import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Circle,
  Database,
  Home,
  Hourglass,
  PauseCircle,
  Pencil,
  PlayCircle,
  QrCode,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  Vote
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ManagerCodeDialog } from '@/components/ManagerCodeDialog';
import { Badge, Button, Card, Input, Skeleton, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { Field, Monogram, PageHeader } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { describeActivity } from '@/lib/activity';
import { api, ApiError, type CondominiumDetail, type ManagerInvitation } from '@/lib/api';
import { cn, formatDate, formatDateTime, formatNumber, formatWhen, initials, plural, useDocumentTitle } from '@/lib/utils';

const VILA_ID = 1;

const toneClasses = {
  brand: 'bg-brand-soft text-brand',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-surface-alt text-muted'
};

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Home; label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
        {detail && <p className="mt-0.5 truncate text-xs text-muted">{detail}</p>}
      </div>
    </Card>
  );
}

function SetupStep({ done, title, children }: { done: boolean; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 py-4 first:pt-0 last:pb-0">
      {done ? (
        <CheckCircle2 aria-label="Feito" className="mt-0.5 size-5 shrink-0 text-ok" />
      ) : (
        <Circle aria-label="Pendente" className="mt-0.5 size-5 shrink-0 text-line-strong" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <div className="mt-0.5 text-sm text-muted">{children}</div>
      </div>
    </li>
  );
}

function RenameDialog({ detail, open, onClose }: { detail: CondominiumDetail; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [name, setName] = useState(detail.condominium.name);
  const rename = useMutation({
    mutationFn: () => api.renameCondominium(detail.condominium.id, name.trim()),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
      notify('ok', `Nome alterado para ${updated.name}.`);
      onClose();
    }
  });
  const tooShort = name.trim().length < 3;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!tooShort) rename.mutate();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        rename.reset();
        setName(detail.condominium.name);
        onClose();
      }}
      title="Renomear condomínio"
      description="O novo nome aparece no painel e no aplicativo dos moradores. O identificador não muda."
      icon={<Pencil aria-hidden className="size-5" />}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="renomear" disabled={rename.isPending || tooShort || name.trim() === detail.condominium.name}>
            {rename.isPending && <Spinner />}
            Salvar nome
          </Button>
        </>
      }
    >
      <form id="renomear" onSubmit={submit} className="space-y-4">
        {rename.isError && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {rename.error.message}
          </div>
        )}
        <Field label="Nome" htmlFor="novo-nome" error={tooShort ? 'Pelo menos 3 letras.' : null}>
          <Input id="novo-nome" data-autofocus value={name} maxLength={140} onChange={(event) => setName(event.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

function StatusDialog({ detail, open, onClose }: { detail: CondominiumDetail; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const suspending = detail.condominium.status === 'ACTIVE';
  const change = useMutation({
    mutationFn: () => api.setCondominiumStatus(detail.condominium.id, suspending ? 'SUSPENDED' : 'ACTIVE'),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
      notify('ok', suspending ? `O acesso de ${updated.name} foi suspenso.` : `O acesso de ${updated.name} foi reativado.`);
      onClose();
    }
  });

  return (
    <Dialog
      open={open}
      onClose={() => {
        change.reset();
        onClose();
      }}
      title={suspending ? `Suspender o acesso de ${detail.condominium.name}?` : `Reativar o acesso de ${detail.condominium.name}?`}
      tone={suspending ? 'danger' : 'ok'}
      icon={suspending ? <PauseCircle aria-hidden className="size-5" /> : <PlayCircle aria-hidden className="size-5" />}
      size="sm"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant={suspending ? 'danger' : 'primary'} disabled={change.isPending} onClick={() => change.mutate()}>
            {change.isPending && <Spinner />}
            {suspending ? 'Suspender acesso' : 'Reativar acesso'}
          </Button>
        </>
      }
    >
      {change.isError && (
        <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {change.error.message}
        </div>
      )}
      <ul className="space-y-3 text-sm">
        {(suspending
          ? [
              { icon: UserX, text: 'Moradores e síndico deixam de entrar no aplicativo, e os convites abertos param de funcionar.' },
              { icon: Database, text: 'Nenhum dado é apagado: tudo volta como estava quando você reativar.' },
              { icon: Vote, text: 'As votações deste condomínio ficam paradas enquanto ele estiver suspenso.' }
            ]
          : [
              { icon: UserCheck, text: 'Moradores e síndico voltam a entrar no aplicativo na hora.' },
              { icon: Database, text: 'Os dados continuam como estavam antes da suspensão.' }
            ]
        ).map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-alt text-muted">
              <Icon aria-hidden className="size-3.5" />
            </span>
            <span className="pt-1 text-muted">{text}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Who will run the condominium gets an account and a code; a new code cancels the previous one. */
function InviteManagerDialog({
  detail,
  open,
  onClose,
  onInvited
}: {
  detail: CondominiumDetail;
  open: boolean;
  onClose: () => void;
  onInvited: (invitation: ManagerInvitation) => void;
}) {
  const queryClient = useQueryClient();
  const again = detail.pendingManager !== null;
  const [name, setName] = useState(detail.pendingManager?.name ?? '');
  const [email, setEmail] = useState(detail.pendingManager?.email ?? '');
  const invite = useMutation({
    mutationFn: () => api.inviteManager(detail.condominium.id, name.trim(), email.trim()),
    onSuccess: (invitation) => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
      onInvited(invitation);
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    invite.mutate();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        invite.reset();
        onClose();
      }}
      size="sm"
      icon={<UserPlus aria-hidden className="size-5" />}
      title={again ? 'Gerar novo código' : 'Convidar síndico'}
      description={
        again
          ? 'O código anterior deixa de valer. Confira o nome e o e-mail antes.'
          : 'A pessoa recebe uma conta de administração deste condomínio e um código para criar a própria senha.'
      }
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="convidar" disabled={invite.isPending || name.trim().length < 2 || !email.includes('@')}>
            {invite.isPending && <Spinner />}
            {again ? 'Gerar código' : 'Convidar'}
          </Button>
        </>
      }
    >
      <form id="convidar" onSubmit={submit} className="space-y-4">
        {invite.isError && (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {invite.error.message}
          </div>
        )}
        <Field label="Nome" htmlFor="convite-nome">
          <Input id="convite-nome" data-autofocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="E-mail de acesso" htmlFor="convite-email" hint="Precisa ser um e-mail sem conta no app.">
          <Input id="convite-email" type="email" value={email} maxLength={160} onChange={(event) => setEmail(event.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Carregando condomínio">
      <Skeleton className="h-4 w-48" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl lg:col-span-3" />
      </div>
    </div>
  );
}

export function CondominiumDetailPage() {
  const id = Number(useParams().id);
  const query = useQuery({ queryKey: ['platform', 'condominium', id], queryFn: () => api.condominium(id), enabled: Number.isInteger(id) });
  const [renaming, setRenaming] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [issued, setIssued] = useState<ManagerInvitation | null>(null);
  useDocumentTitle(query.data?.condominium.name ?? 'Condomínio');

  if (query.isPending) return <DetailSkeleton />;

  if (query.isError) {
    const notFound = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="space-y-6">
        <PageHeader crumbs={[{ label: 'Condomínios', to: '/condominios' }, { label: notFound ? 'Não encontrado' : 'Erro' }]} title={notFound ? 'Condomínio não encontrado' : 'Não consegui abrir este condomínio'} />
        <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
            <AlertTriangle aria-hidden className="size-5" />
          </span>
          <p className="max-w-md text-sm text-muted">{notFound ? 'Ele pode ter sido removido, ou o endereço está errado.' : query.error.message}</p>
          <div className="flex gap-2">
            <Link to="/condominios" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-alt">
              <ArrowLeft aria-hidden className="size-4" /> Voltar à lista
            </Link>
            {!notFound && (
              <Button variant="secondary" onClick={() => query.refetch()}>
                Tentar de novo
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const detail = query.data;
  const condominium = detail.condominium;
  const suspended = condominium.status === 'SUSPENDED';
  const isVila = condominium.id === VILA_ID;

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: 'Condomínios', to: '/condominios' }, { label: condominium.name }]}
        leading={<Monogram text={initials(condominium.name)} size="lg" />}
        title={condominium.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {suspended ? <Badge tone="warn">Suspenso</Badge> : <Badge tone="ok">Ativo</Badge>}
            <span className="font-mono text-xs">{condominium.slug}</span>
            <span aria-hidden>·</span>
            <span>Desde {formatDate(condominium.createdAt)}</span>
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setRenaming(true)}>
              <Pencil aria-hidden className="size-4" />
              Renomear
            </Button>
            {suspended ? (
              <Button onClick={() => setChangingStatus(true)}>
                <PlayCircle aria-hidden className="size-4" />
                Reativar acesso
              </Button>
            ) : (
              <Button
                variant="danger-outline"
                onClick={() => setChangingStatus(true)}
                disabled={isVila}
                title={isVila ? 'A Vila não pode ser suspensa pelo painel.' : undefined}
              >
                <PauseCircle aria-hidden className="size-4" />
                Suspender acesso
              </Button>
            )}
          </>
        }
      />

      {suspended && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <PauseCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong className="font-semibold">Acesso suspenso.</strong> Moradores e síndico não conseguem entrar. Os dados continuam guardados e voltam ao reativar.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={Home} label="Unidades" value={formatNumber(condominium.houses)} detail="Casas e apartamentos ativos" />
        <Metric icon={Users} label="Moradores ativos" value={formatNumber(condominium.activeResidents)} detail="Com acesso ao aplicativo" />
        <Metric
          icon={QrCode}
          label="Pagamentos por Pix"
          value={condominium.pixConnected ? 'Conectado' : 'Não conectado'}
          detail={condominium.pixConnected ? 'Recebe pelo Asaas' : 'Usa tudo menos o Pix'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold">Configuração</h2>
          <p className="mt-1 text-sm text-muted">O que este condomínio já tem para funcionar.</p>
          <ol className="mt-5 divide-y divide-line">
            <SetupStep done={condominium.houses > 0} title="Unidades">
              {condominium.houses > 0 ? plural(condominium.houses, 'unidade cadastrada', 'unidades cadastradas') : 'Nenhuma unidade cadastrada ainda.'}
            </SetupStep>
            <SetupStep done={!!detail.sindicoName || detail.administrators > 0} title="Administração">
              {detail.sindicoName && (
                <span className="flex items-center gap-1.5">
                  <ShieldCheck aria-hidden className="size-3.5 text-brand" />
                  Síndico: {detail.sindicoName}
                  {detail.sindicoHouse ? ` (${detail.sindicoHouse})` : ''}
                </span>
              )}
              {detail.administrators > 0 && <span className="mt-0.5 block">{plural(detail.administrators, 'administrador', 'administradores')} com acesso</span>}
              {detail.pendingManager ? (
                <span className="mt-2 block rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Hourglass aria-hidden className="size-3.5" /> Convite esperando ativação
                  </span>
                  <span className="mt-0.5 block">
                    {detail.pendingManager.name} · {detail.pendingManager.email} · vale até {formatDate(detail.pendingManager.expiresAt)}
                  </span>
                  <button type="button" onClick={() => setInviting(true)} className="mt-1.5 font-medium underline underline-offset-2 hover:opacity-80">
                    Gerar novo código
                  </button>
                </span>
              ) : (
                !detail.sindicoName &&
                detail.administrators === 0 && (
                  <span className="mt-1 block">
                    Ninguém administra ainda.
                    <Button size="sm" variant="secondary" className="mt-2 flex" onClick={() => setInviting(true)}>
                      <UserPlus aria-hidden className="size-4" /> Convidar síndico
                    </Button>
                  </span>
                )
              )}
            </SetupStep>
            <SetupStep done={condominium.pixConnected} title="Pagamentos por Pix">
              {condominium.pixConnected
                ? 'Conta Asaas conectada: as mensalidades saem por Pix.'
                : 'Ainda não conectado. Enquanto isso, o condomínio usa transparência, relatos, orçamentos e votação normalmente.'}
            </SetupStep>
          </ol>
        </Card>

        <Card className="p-6 lg:col-span-3">
          <h2 className="text-base font-semibold">Atividade recente</h2>
          <p className="mt-1 text-sm text-muted">O que foi feito neste condomínio, do mais novo para o mais antigo.</p>
          {detail.activity.length === 0 ? (
            <p className="mt-8 rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">Nada registrado ainda.</p>
          ) : (
            <ol className="relative mt-5 space-y-5 before:absolute before:inset-y-1 before:left-[15px] before:w-px before:bg-line">
              {detail.activity.map((entry, index) => {
                const kind = describeActivity(entry.action);
                const Icon = kind.icon;
                return (
                  <li key={`${entry.at}-${index}`} className="relative flex gap-3">
                    <span className={cn('relative grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-surface', toneClasses[kind.tone])}>
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <p className="text-sm font-medium">{kind.label}</p>
                        <time dateTime={entry.at} title={formatDateTime(entry.at)} className="text-xs text-muted tabular-nums">
                          {formatWhen(entry.at)}
                        </time>
                      </div>
                      {entry.summary && <p className="mt-0.5 break-words text-sm text-muted">{entry.summary}</p>}
                      {entry.actor && <p className="mt-0.5 text-xs text-muted/80">por {entry.actor}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <RenameDialog key={`renomear-${condominium.name}`} detail={detail} open={renaming} onClose={() => setRenaming(false)} />
      <StatusDialog detail={detail} open={changingStatus} onClose={() => setChangingStatus(false)} />
      <InviteManagerDialog
        key={`convite-${detail.pendingManager?.email ?? 'novo'}`}
        detail={detail}
        open={inviting}
        onClose={() => setInviting(false)}
        onInvited={(invitation) => {
          setInviting(false);
          setIssued(invitation);
        }}
      />
      <ManagerCodeDialog invitation={issued} condominiumName={condominium.name} onClose={() => setIssued(null)} />
    </div>
  );
}
