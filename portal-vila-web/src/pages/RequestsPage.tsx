import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Building2, Check, Clock3, Inbox, Mail, MapPin, MessageSquareText, Phone, QrCode, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ManagerCodeDialog } from '@/components/ManagerCodeDialog';
import { FormAlert } from '@/components/PublicLayout';
import { Badge, Button, Card, Input, Skeleton, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { Field, Monogram, PageHeader, Segmented } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, type CondominiumRequest, type ManagerInvitation, type RequestStatus, type UnitLabel } from '@/lib/api';
import { formatDateTime, formatNumber, formatPhone, formatWhen, initials, slugify, useDocumentTitle } from '@/lib/utils';

const tabs: { value: RequestStatus | 'ALL'; label: string }[] = [
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Aprovados' },
  { value: 'REJECTED', label: 'Recusados' },
  { value: 'ALL', label: 'Todos' }
];

const unitLabels: { value: UnitLabel; label: string }[] = [
  { value: 'Casa', label: 'Casas' },
  { value: 'Apto', label: 'Apartamentos' },
  { value: 'Unidade', label: 'Unidades' },
  { value: 'Lote', label: 'Lotes' },
  { value: 'Sala', label: 'Salas' }
];

const asaasAnswers = { SIM: 'Já tem conta no Asaas', NAO: 'Sem conta no Asaas', NAO_SEI: 'Não sabe se tem Asaas' };

function statusBadge(request: CondominiumRequest) {
  if (request.status === 'PENDING') return <Badge tone="warn">Pendente</Badge>;
  if (request.status === 'APPROVED') return <Badge tone="ok">Aprovado</Badge>;
  return <Badge>Recusado</Badge>;
}

function ApproveDialog({ request, onClose, onApproved }: { request: CondominiumRequest | null; onClose: () => void; onApproved: (invitation: ManagerInvitation, condominium: { id: number; name: string }) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [unitLabel, setUnitLabel] = useState<UnitLabel>('Casa');
  const [units, setUnits] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [loadedFor, setLoadedFor] = useState<number | null>(null);

  if (request && loadedFor !== request.id) {
    setLoadedFor(request.id);
    setName(request.condominiumName);
    setSlug(slugify(request.condominiumName));
    setUnitLabel('Casa');
    setUnits(String(request.units));
    setManagerName(request.contactName);
    setManagerEmail(request.contactEmail);
  }

  const approve = useMutation({
    mutationFn: () =>
      api.approveRequest(request!.id, { name: name.trim(), slug: slugify(slug), unitLabel, units: Number(units), managerName: managerName.trim(), managerEmail: managerEmail.trim() }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
      onApproved(result.manager, result.condominium);
    }
  });

  function close() {
    approve.reset();
    setLoadedFor(null);
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    approve.mutate();
  }

  return (
    <Dialog
      open={request !== null}
      onClose={close}
      size="lg"
      title="Aprovar pedido"
      description="Confira os dados: o condomínio é criado com as unidades e o síndico recebe um código para criar a senha."
      icon={<Check aria-hidden className="size-5" />}
      tone="ok"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" form="aprovar" disabled={approve.isPending}>
            {approve.isPending && <Spinner />}
            {approve.isPending ? 'Criando…' : 'Aprovar e criar condomínio'}
          </Button>
        </>
      }
    >
      <form id="aprovar" onSubmit={submit} noValidate className="space-y-6">
        {approve.isError && <FormAlert>{approve.error.message}</FormAlert>}
        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Condomínio</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="aprovar-nome">
              <Input id="aprovar-nome" data-autofocus value={name} maxLength={140} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Identificador" htmlFor="aprovar-id">
              <Input id="aprovar-id" className="font-mono" value={slug} maxLength={60} onChange={(e) => setSlug(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Tipo de unidade</p>
              <Segmented label="Tipo de unidade" value={unitLabel} options={unitLabels} onChange={setUnitLabel} />
            </div>
            <Field label="Quantidade" htmlFor="aprovar-unidades" className="w-28">
              <Input id="aprovar-unidades" type="number" min={0} max={2000} value={units} onChange={(e) => setUnits(e.target.value)} />
            </Field>
          </div>
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Síndico</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" htmlFor="aprovar-sindico">
              <Input id="aprovar-sindico" value={managerName} maxLength={120} onChange={(e) => setManagerName(e.target.value)} />
            </Field>
            <Field label="E-mail de acesso" htmlFor="aprovar-email" hint="Precisa ser um e-mail sem conta no app.">
              <Input id="aprovar-email" type="email" value={managerEmail} maxLength={160} onChange={(e) => setManagerEmail(e.target.value)} />
            </Field>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

function RejectDialog({ request, onClose }: { request: CondominiumRequest | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [note, setNote] = useState('');
  const reject = useMutation({
    mutationFn: () => api.rejectRequest(request!.id, note.trim()),
    onSuccess: (rejected) => {
      queryClient.invalidateQueries({ queryKey: ['platform'] });
      notify('ok', `Pedido de ${rejected.condominiumName} recusado.`);
      close();
    }
  });

  function close() {
    reject.reset();
    setNote('');
    onClose();
  }

  return (
    <Dialog
      open={request !== null}
      onClose={close}
      size="sm"
      tone="danger"
      icon={<X aria-hidden className="size-5" />}
      title={request ? `Recusar o pedido de ${request.condominiumName}?` : 'Recusar pedido'}
      description="Nada é criado. O pedido fica guardado como recusado, com a sua observação."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={reject.isPending} onClick={() => reject.mutate()}>
            {reject.isPending && <Spinner />}
            Recusar pedido
          </Button>
        </>
      }
    >
      {reject.isError && (
        <div className="mb-4">
          <FormAlert>{reject.error.message}</FormAlert>
        </div>
      )}
      <Field label="Observação (opcional)" htmlFor="recusa-nota" hint="Só aparece aqui no painel.">
        <textarea
          id="recusa-nota"
          data-autofocus
          rows={3}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full resize-y rounded-lg border border-line-strong/60 bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
      </Field>
    </Dialog>
  );
}

function RequestCard({ request, onApprove, onReject }: { request: CondominiumRequest; onApprove: () => void; onReject: () => void }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Monogram text={initials(request.condominiumName)} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-semibold">{request.condominiumName}</h2>
              {statusBadge(request)}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5" /> {request.city}/{request.state}
              </span>
              <span className="inline-flex items-center gap-1">
                <Building2 aria-hidden className="size-3.5" /> {formatNumber(request.units)} unidades
              </span>
              <span className="inline-flex items-center gap-1" title={formatDateTime(request.createdAt)}>
                <Clock3 aria-hidden className="size-3.5" /> {formatWhen(request.createdAt)}
              </span>
            </p>
          </div>
        </div>
        {request.status === 'PENDING' && (
          <div className="flex gap-2">
            <Button variant="danger-outline" size="sm" onClick={onReject}>
              Recusar
            </Button>
            <Button size="sm" onClick={onApprove}>
              <Check aria-hidden className="size-4" /> Aprovar
            </Button>
          </div>
        )}
        {request.status === 'APPROVED' && request.condominiumId && (
          <Link to={`/condominios/${request.condominiumId}`} className="text-sm font-medium text-brand hover:underline">
            Ver condomínio
          </Link>
        )}
      </div>

      <div className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
        <div className="space-y-1.5 text-sm">
          <p className="font-medium">{request.contactName}</p>
          <p className="flex items-center gap-2 text-muted">
            <Mail aria-hidden className="size-3.5 shrink-0" />
            <a href={`mailto:${request.contactEmail}`} className="truncate hover:text-ink hover:underline">
              {request.contactEmail}
            </a>
          </p>
          {request.contactPhone && (
            <p className="flex items-center gap-2 text-muted">
              <Phone aria-hidden className="size-3.5 shrink-0" /> {formatPhone(request.contactPhone)}
            </p>
          )}
          <p className="flex items-center gap-2 text-muted">
            <QrCode aria-hidden className="size-3.5 shrink-0" /> {asaasAnswers[request.hasAsaas] ?? asaasAnswers.NAO_SEI}
          </p>
        </div>
        {request.message && (
          <div className="flex gap-2 rounded-lg bg-surface-alt/70 p-3 text-sm text-muted">
            <MessageSquareText aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <p className="whitespace-pre-wrap break-words">{request.message}</p>
          </div>
        )}
      </div>

      {request.status !== 'PENDING' && request.decidedAt && (
        <p className="mt-4 text-xs text-muted">
          {request.status === 'APPROVED' ? 'Aprovado' : 'Recusado'} {formatWhen(request.decidedAt)}
          {request.decidedBy ? ` por ${request.decidedBy}` : ''}
          {request.decisionNote ? ` · “${request.decisionNote}”` : ''}
        </p>
      )}
    </Card>
  );
}

export function RequestsPage() {
  const [tab, setTab] = useState<RequestStatus | 'ALL'>('PENDING');
  const query = useQuery({ queryKey: ['platform', 'requests', tab], queryFn: () => api.requests(tab) });
  const [approving, setApproving] = useState<CondominiumRequest | null>(null);
  const [rejecting, setRejecting] = useState<CondominiumRequest | null>(null);
  const [created, setCreated] = useState<{ invitation: ManagerInvitation; condominium: { id: number; name: string } } | null>(null);
  const navigate = useNavigate();
  useDocumentTitle('Pedidos');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos de cadastro"
        description={
          <>
            O que chega pelo formulário público{' '}
            <a href="/cadastrar" target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
              Quero cadastrar meu condomínio
            </a>
            . Aprovar cria o condomínio e convida o síndico.
          </>
        }
      />

      <Segmented label="Situação dos pedidos" value={tab} options={tabs} onChange={setTab} />

      {query.isPending ? (
        <div className="space-y-4" role="status" aria-label="Carregando pedidos">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <Card role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
            <AlertTriangle aria-hidden className="size-5" />
          </span>
          <p className="font-medium">Não consegui carregar os pedidos</p>
          <p className="max-w-md text-sm text-muted">{query.error.message}</p>
          <Button variant="secondary" onClick={() => query.refetch()}>
            Tentar de novo
          </Button>
        </Card>
      ) : query.data.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
            <Inbox aria-hidden className="size-5" />
          </span>
          <p className="font-medium">{tab === 'PENDING' ? 'Nenhum pedido esperando resposta' : 'Nenhum pedido aqui'}</p>
          <p className="max-w-sm text-sm text-muted">
            Quando alguém preencher o formulário público, o pedido aparece aqui para você aprovar ou recusar.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {query.data.map((request) => (
            <RequestCard key={request.id} request={request} onApprove={() => setApproving(request)} onReject={() => setRejecting(request)} />
          ))}
        </div>
      )}

      <ApproveDialog
        request={approving}
        onClose={() => setApproving(null)}
        onApproved={(invitation, condominium) => {
          setApproving(null);
          setCreated({ invitation, condominium });
        }}
      />
      <RejectDialog request={rejecting} onClose={() => setRejecting(null)} />
      <ManagerCodeDialog
        invitation={created?.invitation ?? null}
        condominiumName={created?.condominium.name ?? ''}
        onClose={() => setCreated(null)}
        actions={
          created && (
            <Button variant="secondary" onClick={() => navigate(`/condominios/${created.condominium.id}`)}>
              Ver condomínio
            </Button>
          )
        }
      />
    </div>
  );
}
