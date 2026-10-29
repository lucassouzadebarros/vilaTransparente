import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardList, Hammer, Plus, Search, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ServiceDialog } from '@/components/demandForms';
import { PriorityBadge, serviceStatuses, StatusBadge } from '@/components/demands';
import { Button, Card, Input, Skeleton } from '@/components/ui';
import { PageHeader, Segmented } from '@/components/ui/page';
import { api, type ServiceOrder } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { formatDate, formatMoney, useDocumentTitle } from '@/lib/utils';
import { Kpi } from '@/pages/ProblemsPage';

type Filter = 'running' | 'done' | 'cancelled' | 'all';

const filters: { value: Filter; label: string }[] = [
  { value: 'running', label: 'Em curso' },
  { value: 'done', label: 'Finalizados' },
  { value: 'cancelled', label: 'Cancelados' },
  { value: 'all', label: 'Todos' }
];

const running = (service: ServiceOrder) => service.status === 'PLANEJADO' || service.status === 'APROVADO' || service.status === 'EM_ANDAMENTO';

const matches: Record<Filter, (service: ServiceOrder) => boolean> = {
  running,
  done: (service) => service.status === 'FINALIZADO',
  cancelled: (service) => service.status === 'CANCELADO',
  all: () => true
};

/** The work done in the condominium: what is planned or under way, what was finished and what it cost. */
export function ServicesPage() {
  const me = useSession();
  useDocumentTitle('Serviços');
  const navigate = useNavigate();
  const services = useQuery({ queryKey: ['condo', 'services'], queryFn: api.services });
  const [filter, setFilter] = useState<Filter>('running');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const all = services.data ?? [];
  const inProgress = all.filter(running);
  const year = String(new Date().getFullYear());
  const doneThisYear = all.filter((service) => service.status === 'FINALIZADO' && (service.completedDate ?? '').startsWith(year));
  const expected = inProgress.reduce((sum, service) => sum + Number(service.expectedValue ?? 0), 0);
  const spent = doneThisYear.reduce((sum, service) => sum + Number(service.finalValue ?? service.expectedValue ?? 0), 0);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return all
      .filter(matches[filter])
      .filter((service) => !term || `${service.title} ${service.supplier ?? ''} ${service.category ?? ''}`.toLocaleLowerCase('pt-BR').includes(term))
      .sort((a, b) =>
        filter === 'running' ? (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999') : (b.completedDate ?? b.createdAt).localeCompare(a.completedDate ?? a.createdAt)
      );
  }, [all, filter, search]);

  const loading = services.isPending;
  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: me.condominium!.name, to: me.role === 'ADMIN' ? '/condominio' : '/condominio/contas' }, { label: 'Serviços' }]}
        title="Serviços"
        description="Os trabalhos feitos no condomínio: o que está planejado ou em andamento, o que foi finalizado e quanto custou."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden className="size-4" />
            Novo serviço
          </Button>
        }
      />
      {creating && <ServiceDialog onClose={() => setCreating(false)} />}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi icon={Hammer} tone="warn" label="Em curso" value={loading ? <Skeleton className="h-7 w-16" /> : inProgress.length} />
        <Kpi icon={Wallet} tone="brand" label="Previsto em curso" value={loading ? <Skeleton className="h-7 w-24" /> : formatMoney(expected)} detail="Soma dos valores previstos" />
        <Kpi
          icon={CheckCircle2}
          tone="ok"
          label={`Finalizados em ${year}`}
          value={loading ? <Skeleton className="h-7 w-16" /> : doneThisYear.length}
          detail={loading ? '…' : `${formatMoney(spent)} gastos`}
        />
        <Kpi icon={ClipboardList} tone="brand" label="Total" value={loading ? <Skeleton className="h-7 w-16" /> : all.length} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <label htmlFor="busca-servico" className="sr-only">
              Buscar serviço
            </label>
            <Input id="busca-servico" type="search" placeholder="Buscar por título, fornecedor ou categoria" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Segmented label="Mostrar" value={filter} options={filters} onChange={setFilter} />
        </div>
        {services.isError ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <AlertTriangle aria-hidden className="size-6 text-danger" />
            <p className="max-w-md text-sm text-muted">{services.error.message}</p>
            <Button variant="secondary" onClick={() => services.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">Serviços</caption>
              <thead className="bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Serviço</th>
                  <th scope="col" className="px-4 py-3 font-medium">Prioridade</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Valor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Data</th>
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
                  visible.map((service) => {
                    const done = service.status === 'FINALIZADO';
                    const value = done ? (service.finalValue ?? service.expectedValue) : service.expectedValue;
                    const date = done ? service.completedDate : service.plannedDate;
                    return (
                      <tr key={service.id} className="cursor-pointer transition-colors hover:bg-surface-alt/50" onClick={() => navigate(`/condominio/servicos/${service.id}`)}>
                        <td className="max-w-sm px-4 py-3.5">
                          <Link to={`/condominio/servicos/${service.id}`} className="font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
                            {service.title}
                          </Link>
                          <p className="truncate text-xs text-muted">{[service.supplier, service.category].filter(Boolean).join(' · ') || 'Sem fornecedor ainda'}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <PriorityBadge priority={service.priority} />
                        </td>
                        <td className="px-4 py-3.5 text-right tabular-nums">
                          {value != null ? (
                            <>
                              <span className="font-medium">{formatMoney(value)}</span>
                              <span className="block text-xs text-muted">{done && service.finalValue != null ? 'final' : 'previsto'}</span>
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-muted">
                          {date ? (
                            <>
                              {formatDate(date)}
                              <span className="block text-xs">{done ? 'concluído' : 'planejado'}</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={service.status} table={serviceStatuses} />
                        </td>
                      </tr>
                    );
                  })}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-14 text-center text-sm text-muted">
                      {all.length === 0 ? 'Nenhum serviço cadastrado ainda.' : 'Nenhum serviço com esse filtro.'}
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
