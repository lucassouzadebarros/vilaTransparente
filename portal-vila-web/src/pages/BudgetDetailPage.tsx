import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, CheckCircle2, Circle, FileText, Hammer, Lock, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { BudgetDialog, ServiceDialog } from '@/components/demandForms';
import { budgetStatuses, Fact, LinkRow, problemStatuses, serviceStatuses, SideCard, StatusBadge, VotingBar } from '@/components/demands';
import { FormAlert } from '@/components/PublicLayout';
import { Button, Card, Skeleton, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, type BudgetVoting } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { formatDate, formatDateTime, formatMoney, plural, useDocumentTitle } from '@/lib/utils';
import { formatDocument } from '@/pages/SuppliersPage';

/** Why a closed voting ended the way it did: passing takes more than half of the units voting, and more yes than no. */
function outcome(status: 'APROVADO' | 'REJEITADO', summary: BudgetVoting) {
  const cast = summary.approveVotes + summary.rejectVotes;
  if (status === 'APROVADO') return `Aprovado com ${plural(summary.approveVotes, 'voto', 'votos')} a favor.`;
  if (cast < summary.votesToApprove) {
    return `Recusado: só ${cast} de ${summary.participatingHouses} unidades votaram, e eram precisos pelo menos ${summary.votesToApprove} votos.`;
  }
  return `Recusado: ${summary.rejectVotes} contra e ${summary.approveVotes} a favor.`;
}

/** One budget: the proposal, the voting house by house, the competing quotes, and what it is for. */
export function BudgetDetailPage() {
  const me = useSession();
  const id = Number(useParams().id);
  const queryClient = useQueryClient();
  const notify = useToast();
  const budgets = useQuery({ queryKey: ['condo', 'demand-budgets'], queryFn: api.fullBudgets });
  const voting = useQuery({ queryKey: ['condo', 'voting', id], queryFn: () => api.budgetVoting(id) });
  const problems = useQuery({ queryKey: ['condo', 'problems'], queryFn: api.problems });
  const services = useQuery({ queryKey: ['condo', 'services'], queryFn: api.services });
  const budget = budgets.data?.find((item) => item.id === id);
  useDocumentTitle(budget?.title ?? 'Orçamento');
  const [confirm, setConfirm] = useState<'close' | 'cancel' | null>(null);
  const [editing, setEditing] = useState(false);
  const [creatingService, setCreatingService] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['condo', 'demand-budgets'] });
    queryClient.invalidateQueries({ queryKey: ['condo', 'voting', id] });
    queryClient.invalidateQueries({ queryKey: ['condo', 'votings'] });
  };
  const close = useMutation({
    mutationFn: () => api.closeVoting(id),
    onSuccess: (summary) => {
      setConfirm(null);
      refresh();
      notify('ok', summary.status === 'APROVADO' ? 'Votação encerrada: orçamento aprovado.' : 'Votação encerrada: orçamento recusado.');
    }
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelBudget(id),
    onSuccess: () => {
      setConfirm(null);
      refresh();
      notify('ok', 'Orçamento cancelado.');
    }
  });

  if (budgets.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (!budget) {
    return (
      <Card role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <AlertTriangle aria-hidden className="size-6 text-danger" />
        <p className="text-sm text-muted">{budgets.error?.message ?? 'Este orçamento não foi encontrado.'}</p>
      </Card>
    );
  }

  const summary = voting.data;
  const problem = problems.data?.find((item) => item.id === budget.problemReportId);
  const service = services.data?.find((item) => item.id === budget.serviceId) ?? services.data?.find((item) => item.approvedBudgetId === budget.id);
  const competitors = (budgets.data ?? []).filter(
    (other) =>
      other.id !== budget.id &&
      other.competes &&
      budget.competes &&
      ((budget.serviceId != null && other.serviceId === budget.serviceId) || (budget.problemReportId != null && other.problemReportId === budget.problemReportId))
  );
  const open = budget.status === 'EM_ANALISE';
  const mutation = confirm === 'close' ? close : cancel;

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: me.condominium!.name, to: me.role === 'ADMIN' ? '/condominio' : '/condominio/contas' }, { label: 'Orçamentos', to: '/condominio/orcamentos' }, { label: budget.title }]}
        title={budget.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={budget.status} table={budgetStatuses} />
            <span>
              {budget.supplier} · {formatMoney(budget.amount)}
            </span>
          </span>
        }
        actions={
          open ? (
            <>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden className="size-4" />
                Editar
              </Button>
              <Button variant="secondary" onClick={() => setConfirm('close')}>
                <Lock aria-hidden className="size-4" />
                Encerrar votação
              </Button>
              <Button variant="danger-outline" onClick={() => setConfirm('cancel')}>
                <Ban aria-hidden className="size-4" />
                Cancelar
              </Button>
            </>
          ) : (
            budget.status === 'APROVADO' &&
            !service && (
              <Button onClick={() => setCreatingService(true)}>
                <Hammer aria-hidden className="size-4" />
                Abrir serviço
              </Button>
            )
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-6">
          <Card className="space-y-5 p-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Fact label="Fornecedor">{budget.supplier}</Fact>
              <Fact label="CPF ou CNPJ">{budget.supplierDocument ? formatDocument(budget.supplierDocument) : '—'}</Fact>
              <Fact label="Telefone">{budget.phone ?? '—'}</Fact>
              <Fact label="Valor">
                <span className="font-semibold">{formatMoney(budget.amount)}</span>
              </Fact>
              <Fact label="Data do orçamento">{formatDate(budget.budgetDate)}</Fact>
              <Fact label="Válido até">{formatDate(budget.validUntil)}</Fact>
              <Fact label="Prazo para fazer">{formatDate(budget.expectedDate)}</Fact>
              <Fact label="Prazo da votação">{formatDate(budget.votingDeadline)}</Fact>
              <Fact label="Concorre com outros">{budget.competes ? 'Sim' : 'Não'}</Fact>
            </dl>
            {budget.scope && (
              <div>
                <p className="text-xs text-muted">O que será feito</p>
                <p className="mt-1 whitespace-pre-line text-sm">{budget.scope}</p>
              </div>
            )}
            {budget.notes && (
              <div>
                <p className="text-xs text-muted">Observações</p>
                <p className="mt-1 whitespace-pre-line text-sm">{budget.notes}</p>
              </div>
            )}
            {budget.documentId && (
              <Button variant="secondary" size="sm" onClick={() => api.openDocument(budget.documentId!).catch((error: Error) => notify('danger', error.message))}>
                <FileText aria-hidden className="size-4" />
                Abrir o orçamento (PDF ou foto)
              </Button>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Votação das unidades</h2>
              {summary && (
                <span className="text-xs text-muted">
                  {summary.open
                    ? `Precisa de ${plural(summary.votesToApprove, 'voto', 'votos')} a favor de ${summary.participatingHouses} unidades`
                    : summary.closedAt
                      ? `Encerrada em ${formatDateTime(summary.closedAt)}`
                      : 'Encerrada'}
                </span>
              )}
            </div>
            {voting.isPending ? (
              <Skeleton className="h-24 rounded-lg" />
            ) : !summary ? (
              <p className="text-sm text-muted">{voting.error?.message ?? 'Sem votação.'}</p>
            ) : (
              <div className="space-y-4">
                {/* Once closed the API stops counting who is missing: the bar then compares with the units that could vote. */}
                <VotingBar
                  approve={summary.approveVotes}
                  reject={summary.rejectVotes}
                  pending={summary.open ? summary.pendingVotes : Math.max(0, summary.participatingHouses - summary.approveVotes - summary.rejectVotes)}
                  closed={!summary.open}
                />
                {!summary.open && (budget.status === 'APROVADO' || budget.status === 'REJEITADO') && (
                  <p className="text-sm">{outcome(budget.status, summary)}</p>
                )}
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {summary.houses.map((house) => (
                    <li key={house.houseId} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                      {house.voted ? <CheckCircle2 aria-hidden className="size-4 text-ok" /> : <Circle aria-hidden className="size-4 text-line-strong" />}
                      <span className="flex-1">{house.houseLabel}</span>
                      <span className="text-xs text-muted">{house.voted ? 'Votou' : 'Falta'}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted">Aqui aparece só quem já votou, não o voto de cada unidade.</p>
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <SideCard title="De onde veio">
            {problem ? (
              <LinkRow to={`/condominio/problemas/${problem.id}`} title={problem.title} detail={problem.location} badge={<StatusBadge status={problem.status} table={problemStatuses} />} />
            ) : (
              <p className="text-sm text-muted">Não está ligado a um problema relatado.</p>
            )}
          </SideCard>
          <SideCard title="Serviço">
            {service ? (
              <LinkRow to={`/condominio/servicos/${service.id}`} title={service.title} detail={service.supplier ?? undefined} badge={<StatusBadge status={service.status} table={serviceStatuses} />} />
            ) : (
              <p className="text-sm text-muted">Nenhum serviço ainda.</p>
            )}
          </SideCard>
          <SideCard title="Concorrentes">
            {competitors.length === 0 ? (
              <p className="text-sm text-muted">Nenhum outro orçamento para o mesmo trabalho.</p>
            ) : (
              competitors.map((other) => (
                <LinkRow
                  key={other.id}
                  to={`/condominio/orcamentos/${other.id}`}
                  title={other.supplier}
                  detail={formatMoney(other.amount)}
                  badge={<StatusBadge status={other.status} table={budgetStatuses} />}
                />
              ))
            )}
          </SideCard>
        </div>
      </div>

      {editing && <BudgetDialog budget={budget} onClose={() => setEditing(false)} />}
      {creatingService && <ServiceDialog budget={budget} problem={problem} onClose={() => setCreatingService(false)} />}

      <Dialog
        open={confirm !== null}
        onClose={() => !mutation.isPending && setConfirm(null)}
        tone={confirm === 'cancel' ? 'danger' : 'brand'}
        size="sm"
        icon={confirm === 'cancel' ? <Ban aria-hidden className="size-5" /> : <Lock aria-hidden className="size-5" />}
        title={confirm === 'cancel' ? 'Cancelar este orçamento?' : 'Encerrar a votação agora?'}
        description={
          confirm === 'cancel'
            ? 'A votação para e ele sai da lista dos que estão em votação.'
            : 'O resultado vale com os votos dados até agora: passa se mais da metade das unidades votou e houve mais votos a favor.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={mutation.isPending} data-autofocus>
              Voltar
            </Button>
            <Button variant={confirm === 'cancel' ? 'danger' : 'primary'} onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending && <Spinner />}
              {confirm === 'cancel' ? 'Cancelar orçamento' : 'Encerrar votação'}
            </Button>
          </>
        }
      >
        {mutation.isError && <FormAlert>{mutation.error.message}</FormAlert>}
      </Dialog>
    </div>
  );
}
