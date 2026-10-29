import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardList, Search, Vote, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { budgetStatuses, StatusBadge, VotingBar } from '@/components/demands';
import { Button, Card, Input, Skeleton } from '@/components/ui';
import { PageHeader, Segmented } from '@/components/ui/page';
import { api, type Budget } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { formatDate, formatMoney, plural, useDocumentTitle } from '@/lib/utils';
import { Kpi } from '@/pages/ProblemsPage';

type Filter = Budget['status'] | 'ALL';

const filters: { value: Filter; label: string }[] = [
  { value: 'EM_ANALISE', label: 'Em votação' },
  { value: 'APROVADO', label: 'Aprovados' },
  { value: 'REJEITADO', label: 'Recusados' },
  { value: 'CANCELADO', label: 'Cancelados' },
  { value: 'ALL', label: 'Todos' }
];

/** The quotes the units vote on: how each voting is going, and what was approved or refused. */
export function BudgetsPage() {
  const me = useSession();
  useDocumentTitle('Orçamentos');
  const navigate = useNavigate();
  const budgets = useQuery({ queryKey: ['condo', 'demand-budgets'], queryFn: api.fullBudgets });
  const votings = useQuery({ queryKey: ['condo', 'votings'], queryFn: api.budgetVotings });
  const [filter, setFilter] = useState<Filter>('EM_ANALISE');
  const [search, setSearch] = useState('');

  const all = budgets.data ?? [];
  const byBudget = useMemo(() => new Map((votings.data ?? []).map((voting) => [voting.budgetId, voting])), [votings.data]);
  const voting = all.filter((budget) => budget.status === 'EM_ANALISE');
  const approved = all.filter((budget) => budget.status === 'APROVADO');
  const refused = all.filter((budget) => budget.status === 'REJEITADO');

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return all
      .filter((budget) => filter === 'ALL' || budget.status === filter)
      .filter((budget) => !term || `${budget.title} ${budget.supplier}`.toLocaleLowerCase('pt-BR').includes(term))
      .sort((a, b) => (filter === 'EM_ANALISE' ? (a.votingDeadline ?? '').localeCompare(b.votingDeadline ?? '') : b.createdAt.localeCompare(a.createdAt)));
  }, [all, filter, search]);

  const loading = budgets.isPending;
  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: me.condominium!.name, to: me.role === 'ADMIN' ? '/condominio' : '/condominio/contas' }, { label: 'Orçamentos' }]}
        title="Orçamentos"
        description="As propostas que as unidades votam: o andamento de cada votação e o que foi aprovado ou recusado."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi icon={Vote} tone="warn" label="Em votação" value={loading ? <Skeleton className="h-7 w-16" /> : voting.length} />
        <Kpi icon={CheckCircle2} tone="ok" label="Aprovados" value={loading ? <Skeleton className="h-7 w-16" /> : approved.length} detail={loading ? '…' : formatMoney(approved.reduce((sum, budget) => sum + Number(budget.amount), 0))} />
        <Kpi icon={XCircle} tone="danger" label="Recusados" value={loading ? <Skeleton className="h-7 w-16" /> : refused.length} />
        <Kpi icon={ClipboardList} tone="brand" label="Total" value={loading ? <Skeleton className="h-7 w-16" /> : all.length} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <label htmlFor="busca-orcamento" className="sr-only">
              Buscar orçamento
            </label>
            <Input id="busca-orcamento" type="search" placeholder="Buscar por título ou fornecedor" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Segmented label="Mostrar" value={filter} options={filters} onChange={setFilter} />
        </div>
        {budgets.isError ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <AlertTriangle aria-hidden className="size-6 text-danger" />
            <p className="max-w-md text-sm text-muted">{budgets.error.message}</p>
            <Button variant="secondary" onClick={() => budgets.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Orçamentos</caption>
              <thead className="bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Orçamento</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Valor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Votação</th>
                  <th scope="col" className="px-4 py-3 font-medium">Fim da votação</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading &&
                  [0, 1, 2].map((index) => (
                    <tr key={index}>
                      {[0, 1, 2, 3, 4].map((cell) => (
                        <td key={cell} className="px-4 py-4">
                          <Skeleton className="h-4 w-full max-w-28" />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!loading &&
                  visible.map((budget) => {
                    const summary = byBudget.get(budget.id);
                    return (
                      <tr key={budget.id} className="cursor-pointer transition-colors hover:bg-surface-alt/50" onClick={() => navigate(`/condominio/orcamentos/${budget.id}`)}>
                        <td className="max-w-sm px-4 py-3.5">
                          <Link to={`/condominio/orcamentos/${budget.id}`} className="font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
                            {budget.title}
                          </Link>
                          <p className="truncate text-xs text-muted">{budget.supplier}</p>
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium tabular-nums">{formatMoney(budget.amount)}</td>
                        <td className="min-w-48 px-4 py-3.5">
                          {summary && budget.status === 'EM_ANALISE' ? (
                            <VotingBar approve={summary.approveVotes} reject={summary.rejectVotes} pending={summary.pendingVotes} />
                          ) : (
                            <span className="text-muted">{budget.votingClosedAt ? `Encerrada em ${formatDate(budget.votingClosedAt)}` : '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-muted">{budget.votingDeadline ? formatDate(budget.votingDeadline) : '—'}</td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={budget.status} table={budgetStatuses} />
                        </td>
                      </tr>
                    );
                  })}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-14 text-center text-sm text-muted">
                      {all.length === 0 ? 'Nenhum orçamento cadastrado ainda.' : 'Nenhum orçamento com esse filtro.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {voting.length > 0 && filter !== 'EM_ANALISE' && (
          <p className="border-t border-line px-4 py-3 text-xs text-muted">{plural(voting.length, 'orçamento está', 'orçamentos estão')} em votação agora.</p>
        )}
      </Card>
    </div>
  );
}
