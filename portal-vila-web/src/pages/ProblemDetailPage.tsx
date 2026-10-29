import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, CircleDot, MessageSquare, Plus, Send, Wrench } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { BudgetDialog, ServiceDialog } from '@/components/demandForms';
import { budgetStatuses, Fact, LinkRow, PriorityBadge, problemStatuses, serviceStatuses, SideCard, StatusBadge } from '@/components/demands';
import { FormAlert } from '@/components/PublicLayout';
import { Button, Card, Skeleton, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, type PortalDocument, type ProblemEvent, type ProblemReport } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { formatDateTime, formatMoney, formatWhen, useDocumentTitle } from '@/lib/utils';
import { useHouseLabels } from '@/pages/ProblemsPage';

const eventIcons: Record<ProblemEvent['kind'], typeof CircleDot> = { CREATED: CircleDot, STATUS: CircleDot, SERVICE: Wrench, COMMENT: MessageSquare };

/** The photos of a report, each one shown through a short-lived signed address. */
function Photos({ documents }: { documents: PortalDocument[] }) {
  const [urls, setUrls] = useState<Record<number, string>>({});
  useEffect(() => {
    let alive = true;
    Promise.all(documents.map(async (document) => [document.id, await api.documentImageUrl(document.id).catch(() => '')] as const)).then((pairs) => {
      if (alive) setUrls(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [documents]);
  if (documents.length === 0) return <p className="text-sm text-muted">Sem fotos.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {documents.map((document) =>
        urls[document.id] ? (
          <a key={document.id} href={urls[document.id]} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line">
            <img src={urls[document.id]} alt={document.name} className="aspect-square w-full object-cover transition-transform hover:scale-105" />
          </a>
        ) : (
          <Skeleton key={document.id} className="aspect-square w-full rounded-lg" />
        )
      )}
    </div>
  );
}

/** The conversation and the steps of a report, and a comment of the administration or the síndico. */
function Timeline({ reportId, events }: { reportId: number; events: ProblemEvent[] }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const send = useMutation({
    mutationFn: () => api.commentProblem(reportId, message.trim()),
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['condo', 'problem-events', reportId] });
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (message.trim()) send.mutate();
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold">Histórico e conversa</h2>
      <ol className="space-y-4">
        {events.map((event) => {
          const Icon = eventIcons[event.kind] ?? CircleDot;
          const comment = event.kind === 'COMMENT';
          return (
            <li key={event.id} className="flex gap-3">
              <span className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${comment ? 'bg-brand-soft text-brand' : 'bg-surface-alt text-muted'}`}>
                <Icon aria-hidden className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className={comment ? 'text-sm' : 'text-sm text-muted'}>
                  {comment && event.author && <strong className="font-semibold text-ink">{event.author}: </strong>}
                  {event.message}
                </p>
                <p className="text-xs text-muted" title={formatDateTime(event.createdAt)}>
                  {formatWhen(event.createdAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <form onSubmit={submit} className="mt-5 space-y-2 border-t border-line pt-4">
        {send.isError && <FormAlert>{send.error.message}</FormAlert>}
        <label htmlFor="comentario" className="text-sm font-medium">
          Escrever para quem relatou
        </label>
        <textarea
          id="comentario"
          rows={3}
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-lg border border-line-strong/60 bg-surface px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
          placeholder="Ex.: O encanador vem na quinta de manhã."
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={send.isPending || !message.trim()}>
            {send.isPending ? <Spinner /> : <Send aria-hidden className="size-4" />}
            Enviar
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** One report: what, where, photos, the conversation, and the budgets and service that came from it. */
export function ProblemDetailPage() {
  const me = useSession();
  const id = Number(useParams().id);
  const queryClient = useQueryClient();
  const notify = useToast();
  const problems = useQuery({ queryKey: ['condo', 'problems'], queryFn: api.problems });
  const events = useQuery({ queryKey: ['condo', 'problem-events', id], queryFn: () => api.problemEvents(id) });
  const photos = useQuery({ queryKey: ['condo', 'documents', 'PROBLEM_REPORT', id], queryFn: () => api.documents('PROBLEM_REPORT', id) });
  const budgets = useQuery({ queryKey: ['condo', 'demand-budgets'], queryFn: api.fullBudgets });
  const services = useQuery({ queryKey: ['condo', 'services'], queryFn: api.services });
  const houseLabels = useHouseLabels();
  const report = problems.data?.find((item) => item.id === id);
  useDocumentTitle(report?.title ?? 'Problema');
  const [status, setStatus] = useState<ProblemReport['status'] | ''>('');
  const [cancelling, setCancelling] = useState(false);
  const [dialog, setDialog] = useState<'budget' | 'service' | null>(null);
  useEffect(() => {
    if (report) setStatus(report.status);
  }, [report]);

  const save = useMutation({
    mutationFn: () => api.updateProblem({ ...(report as ProblemReport), status: status as ProblemReport['status'] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['condo', 'problems'] });
      queryClient.invalidateQueries({ queryKey: ['condo', 'problem-events', id] });
      notify('ok', 'Situação atualizada. Quem relatou recebe o aviso no celular.');
    },
    onError: (error) => notify('danger', error.message)
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelProblem(id),
    onSuccess: () => {
      setCancelling(false);
      queryClient.invalidateQueries({ queryKey: ['condo', 'problems'] });
      queryClient.invalidateQueries({ queryKey: ['condo', 'problem-events', id] });
      notify('ok', 'Relato cancelado.');
    }
  });

  if (problems.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (!report) {
    return (
      <Card role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <AlertTriangle aria-hidden className="size-6 text-danger" />
        <p className="text-sm text-muted">{problems.error?.message ?? 'Este problema não foi encontrado.'}</p>
      </Card>
    );
  }

  const quotes = (budgets.data ?? []).filter((budget) => budget.problemReportId === id);
  const linkedServices = (services.data ?? []).filter((service) => service.problemReportId === id || service.id === report.serviceId);
  const finished = report.status === 'RESOLVIDO' || report.status === 'CANCELADO';
  const activeService = linkedServices.some((service) => service.status !== 'CANCELADO');
  // An approved quote of this problem that has no service yet is where the service comes from.
  const readyQuote = quotes.find((budget) => budget.status === 'APROVADO' && budget.serviceId == null);

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: me.condominium!.name, to: me.role === 'ADMIN' ? '/condominio' : '/condominio/contas' }, { label: 'Problemas', to: '/condominio/problemas' }, { label: report.title }]}
        title={report.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={report.status} table={problemStatuses} />
            <PriorityBadge priority={report.priority} />
            <span>relatado {formatWhen(report.createdAt)}</span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-6">
          <Card className="space-y-5 p-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {me.role === 'ADMIN' && <Fact label="Unidade">{report.houseId ? (houseLabels.get(report.houseId) ?? '—') : 'Administração'}</Fact>}
              <Fact label="Local">{report.location}</Fact>
              <Fact label="Categoria">{report.category}</Fact>
            </dl>
            <div>
              <p className="text-xs text-muted">O que aconteceu</p>
              <p className="mt-1 whitespace-pre-line text-sm">{report.description}</p>
            </div>
            <div>
              <p className="mb-2 text-xs text-muted">Fotos</p>
              {photos.isPending ? <Skeleton className="h-32 rounded-lg" /> : <Photos documents={photos.data ?? []} />}
            </div>
          </Card>
          {events.data && <Timeline reportId={id} events={events.data} />}
        </div>

        <div className="min-w-0 space-y-6">
          {me.role === 'ADMIN' && (
            <SideCard title="Situação">
              <div className="space-y-3">
                <select
                  aria-label="Situação do problema"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProblemReport['status'])}
                  className="h-10 w-full rounded-lg border border-line-strong/60 bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                >
                  {(Object.keys(problemStatuses) as ProblemReport['status'][]).map((key) => (
                    <option key={key} value={key}>
                      {problemStatuses[key].label}
                    </option>
                  ))}
                </select>
                <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending || status === report.status}>
                  {save.isPending && <Spinner />}
                  Salvar situação
                </Button>
                {!finished && (
                  <Button variant="danger-outline" className="w-full" onClick={() => setCancelling(true)}>
                    <Ban aria-hidden className="size-4" />
                    Cancelar relato
                  </Button>
                )}
              </div>
            </SideCard>
          )}

          <SideCard
            title="Orçamentos"
            action={
              !finished && (
                <Button size="sm" variant="secondary" onClick={() => setDialog('budget')}>
                  <Plus aria-hidden className="size-4" />
                  Gerar orçamento
                </Button>
              )
            }
          >
            {quotes.length === 0 ? (
              <p className="text-sm text-muted">Nenhum orçamento deste problema ainda.</p>
            ) : (
              <div>
                {quotes.map((budget) => (
                  <LinkRow
                    key={budget.id}
                    to={`/condominio/orcamentos/${budget.id}`}
                    title={budget.supplier}
                    detail={formatMoney(budget.amount)}
                    badge={<StatusBadge status={budget.status} table={budgetStatuses} />}
                  />
                ))}
              </div>
            )}
          </SideCard>

          <SideCard
            title="Serviço"
            action={
              !finished &&
              !activeService && (
                <Button size="sm" variant={readyQuote ? 'primary' : 'secondary'} onClick={() => setDialog('service')}>
                  <Plus aria-hidden className="size-4" />
                  Abrir serviço
                </Button>
              )
            }
          >
            {linkedServices.length === 0 ? (
              <p className="text-sm text-muted">
                {readyQuote ? `O orçamento de ${readyQuote.supplier} foi aprovado: já pode virar serviço.` : 'Nenhum serviço ligado a este problema.'}
              </p>
            ) : (
              linkedServices.map((service) => (
                <LinkRow
                  key={service.id}
                  to={`/condominio/servicos/${service.id}`}
                  title={service.title}
                  detail={[service.supplier, service.finalValue != null ? formatMoney(service.finalValue) : service.expectedValue != null ? formatMoney(service.expectedValue) : null].filter(Boolean).join(' · ')}
                  badge={<StatusBadge status={service.status} table={serviceStatuses} />}
                />
              ))
            )}
          </SideCard>
        </div>
      </div>

      {dialog === 'budget' && <BudgetDialog problem={report} onClose={() => setDialog(null)} />}
      {dialog === 'service' && <ServiceDialog problem={report} budget={readyQuote} onClose={() => setDialog(null)} />}

      <Dialog
        open={cancelling}
        onClose={() => !cancel.isPending && setCancelling(false)}
        tone="danger"
        size="sm"
        icon={<Ban aria-hidden className="size-5" />}
        title="Cancelar este relato?"
        description="Ele sai da lista dos em aberto. Quem relatou continua vendo o histórico."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(false)} disabled={cancel.isPending} data-autofocus>
              Voltar
            </Button>
            <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending && <Spinner />}
              Cancelar relato
            </Button>
          </>
        }
      >
        {cancel.isError && <FormAlert>{cancel.error.message}</FormAlert>}
      </Dialog>
    </div>
  );
}
