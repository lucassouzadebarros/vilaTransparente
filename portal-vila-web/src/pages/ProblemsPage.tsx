import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Camera, CircleDot, Search, Siren, Timer, Wrench } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PriorityBadge, problemStatuses, StatusBadge } from '@/components/demands';
import { Button, Card, Input, Skeleton } from '@/components/ui';
import { PageHeader, Segmented } from '@/components/ui/page';
import { api, type ProblemReport } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { cn, formatDate, formatWhen, plural, useDocumentTitle } from '@/lib/utils';

type Filter = 'open' | 'solved' | 'cancelled' | 'all';

const filters: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Em aberto' },
  { value: 'solved', label: 'Resolvidos' },
  { value: 'cancelled', label: 'Cancelados' },
  { value: 'all', label: 'Todos' }
];

const matches: Record<Filter, (report: ProblemReport) => boolean> = {
  open: (report) => report.status === 'ABERTO' || report.status === 'EM_ANALISE',
  solved: (report) => report.status === 'RESOLVIDO',
  cancelled: (report) => report.status === 'CANCELADO',
  all: () => true
};

const urgency: Record<string, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };

export function Kpi({ icon: Icon, label, value, detail, tone }: { icon: typeof Wrench; label: string; value: ReactNode; detail?: ReactNode; tone: 'brand' | 'ok' | 'warn' | 'danger' }) {
  const tones = { brand: 'bg-brand-soft text-brand', ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', danger: 'bg-danger-soft text-danger' };
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', tones[tone])}>
          <Icon aria-hidden className="size-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
      {detail && <div className="mt-1 text-xs text-muted">{detail}</div>}
    </Card>
  );
}

/** The units' house labels, for the administration; the síndico sees the place written in the report instead. */
export function useHouseLabels() {
  const me = useSession();
  const houses = useQuery({ queryKey: ['condo', 'houses'], queryFn: api.houses, enabled: me.role === 'ADMIN' });
  return useMemo(() => new Map((houses.data ?? []).map((house) => [house.houseId, house.label])), [houses.data]);
}

/** What the units reported: open ones first, the most urgent on top, with what was done about each. */
export function ProblemsPage() {
  const me = useSession();
  useDocumentTitle('Problemas');
  const navigate = useNavigate();
  const problems = useQuery({ queryKey: ['condo', 'problems'], queryFn: api.problems });
  const budgets = useQuery({ queryKey: ['condo', 'demand-budgets'], queryFn: api.fullBudgets });
  const services = useQuery({ queryKey: ['condo', 'services'], queryFn: api.services });
  const houseLabels = useHouseLabels();
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');

  const all = problems.data ?? [];
  const open = all.filter(matches.open);
  const urgent = open.filter((report) => report.priority === 'URGENTE' || report.priority === 'ALTA');
  const waiting = all.filter((report) => report.status === 'ABERTO');
  const solved30 = all.filter((report) => report.status === 'RESOLVIDO' && Date.now() - new Date(report.updatedAt).getTime() < 30 * 86400000);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return all
      .filter(matches[filter])
      .filter((report) => !term || `${report.title} ${report.location} ${report.category}`.toLocaleLowerCase('pt-BR').includes(term))
      .sort((a, b) =>
        filter === 'open'
          ? (urgency[a.priority] ?? 2) - (urgency[b.priority] ?? 2) || a.createdAt.localeCompare(b.createdAt)
          : b.createdAt.localeCompare(a.createdAt)
      );
  }, [all, filter, search]);

  function progress(report: ProblemReport) {
    const quotes = (budgets.data ?? []).filter((budget) => budget.problemReportId === report.id && budget.status !== 'CANCELADO');
    const service = (services.data ?? []).find((item) => item.id === report.serviceId || item.problemReportId === report.id);
    const parts = [
      quotes.length > 0 && plural(quotes.length, 'orçamento', 'orçamentos'),
      service && `serviço ${service.status === 'FINALIZADO' ? 'finalizado' : service.status === 'CANCELADO' ? 'cancelado' : 'em curso'}`
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : 'Nada ainda';
  }

  const loading = problems.isPending;
  const showUnit = me.role === 'ADMIN';
  const columns = showUnit ? 6 : 5;
  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: me.condominium!.name, to: me.role === 'ADMIN' ? '/condominio' : '/condominio/contas' }, { label: 'Problemas' }]}
        title="Problemas"
        description="O que as unidades relataram, com fotos e o que foi feito: orçamentos, serviços e conversa."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi icon={CircleDot} tone="warn" label="Em aberto" value={loading ? <Skeleton className="h-7 w-16" /> : open.length} detail={loading ? '…' : `${waiting.length} sem análise ainda`} />
        <Kpi icon={Siren} tone="danger" label="Urgentes ou altos" value={loading ? <Skeleton className="h-7 w-16" /> : urgent.length} detail="Entre os em aberto" />
        <Kpi icon={Wrench} tone="ok" label="Resolvidos em 30 dias" value={loading ? <Skeleton className="h-7 w-16" /> : solved30.length} />
        <Kpi icon={Timer} tone="brand" label="Total de relatos" value={loading ? <Skeleton className="h-7 w-16" /> : all.length} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <label htmlFor="busca-problema" className="sr-only">
              Buscar problema
            </label>
            <Input id="busca-problema" type="search" placeholder="Buscar por título, local ou categoria" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Segmented label="Mostrar" value={filter} options={filters} onChange={setFilter} />
        </div>
        {problems.isError ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <AlertTriangle aria-hidden className="size-6 text-danger" />
            <p className="max-w-md text-sm text-muted">{problems.error.message}</p>
            <Button variant="secondary" onClick={() => problems.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">Problemas relatados</caption>
              <thead className="bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Problema</th>
                  {showUnit && <th scope="col" className="px-4 py-3 font-medium">Unidade</th>}
                  <th scope="col" className="px-4 py-3 font-medium">Prioridade</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                  <th scope="col" className="px-4 py-3 font-medium">Relatado</th>
                  <th scope="col" className="px-4 py-3 font-medium">Andamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading &&
                  [0, 1, 2].map((index) => (
                    <tr key={index}>
                      {Array.from({ length: columns }, (_, cell) => (
                        <td key={cell} className="px-4 py-4">
                          <Skeleton className="h-4 w-full max-w-28" />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!loading &&
                  visible.map((report) => (
                    <tr key={report.id} className="cursor-pointer transition-colors hover:bg-surface-alt/50" onClick={() => navigate(`/condominio/problemas/${report.id}`)}>
                      <td className="max-w-sm px-4 py-3.5">
                        <Link to={`/condominio/problemas/${report.id}`} className="font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
                          {report.title}
                        </Link>
                        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                          {report.location} · {report.category}
                          {report.photoCount ? (
                            <span className="inline-flex items-center gap-0.5">
                              · <Camera aria-hidden className="size-3" /> {report.photoCount}
                            </span>
                          ) : null}
                        </p>
                      </td>
                      {showUnit && <td className="px-4 py-3.5 text-muted">{report.houseId ? (houseLabels.get(report.houseId) ?? '—') : 'Administração'}</td>}
                      <td className="px-4 py-3.5">
                        <PriorityBadge priority={report.priority} />
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={report.status} table={problemStatuses} />
                      </td>
                      <td className="px-4 py-3.5 text-muted" title={formatDate(report.createdAt)}>
                        {formatWhen(report.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 text-muted">{progress(report)}</td>
                    </tr>
                  ))}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={columns} className="px-4 py-14 text-center text-sm text-muted">
                      {all.length === 0 ? 'Nenhum problema relatado ainda.' : 'Nenhum problema com esse filtro.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
