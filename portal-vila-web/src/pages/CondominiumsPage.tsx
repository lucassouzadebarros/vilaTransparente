import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Building2, Home, QrCode, RefreshCw, Search, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, Card, Input, Skeleton } from '@/components/ui';
import { api, type CondominiumSummary } from '@/lib/api';
import { cn, formatDate, formatNumber } from '@/lib/utils';

type StatusFilter = 'all' | 'active' | 'suspended';
type SortKey = 'name' | 'houses' | 'activeResidents' | 'createdAt';
type Sort = { key: SortKey; direction: 'asc' | 'desc' };

const filters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'suspended', label: 'Suspensos' }
];

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Building2; label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Icon aria-hidden className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

function SortHeader({ label, column, sort, onSort, align = 'left' }: { label: string; column: SortKey; sort: Sort; onSort: (key: SortKey) => void; align?: 'left' | 'right' }) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-4 py-3 font-medium', align === 'right' && 'text-right')}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn('inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink', active && 'text-ink', align === 'right' && 'flex-row-reverse')}
      >
        {label}
        <Icon aria-hidden className="size-3.5" />
      </button>
    </th>
  );
}

function statusBadge(status: string) {
  if (status === 'ACTIVE') return <Badge tone="ok">Ativo</Badge>;
  if (status === 'SUSPENDED') return <Badge tone="warn">Suspenso</Badge>;
  return <Badge>{status}</Badge>;
}

function compare(a: CondominiumSummary, b: CondominiumSummary, key: SortKey) {
  if (key === 'name') return a.name.localeCompare(b.name, 'pt-BR');
  if (key === 'createdAt') return a.createdAt.localeCompare(b.createdAt);
  return a[key] - b[key];
}

export function CondominiumsPage() {
  const query = useQuery({ queryKey: ['platform', 'condominiums'], queryFn: api.condominiums });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<Sort>({ key: 'name', direction: 'asc' });

  const all = query.data ?? [];
  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return all
      .filter((row) => status === 'all' || (status === 'active' ? row.status === 'ACTIVE' : row.status === 'SUSPENDED'))
      .filter((row) => !term || row.name.toLocaleLowerCase('pt-BR').includes(term) || row.slug.includes(term))
      .sort((a, b) => compare(a, b, sort.key) * (sort.direction === 'asc' ? 1 : -1));
  }, [all, search, status, sort]);

  const totals = useMemo(
    () => ({
      active: all.filter((row) => row.status === 'ACTIVE').length,
      houses: all.reduce((sum, row) => sum + row.houses, 0),
      residents: all.reduce((sum, row) => sum + row.activeResidents, 0),
      pix: all.filter((row) => row.pixConnected).length
    }),
    [all]
  );

  const onSort = (key: SortKey) =>
    setSort((current) => (current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: key === 'name' ? 'asc' : 'desc' }));

  const loading = query.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Condomínios</h1>
          <p className="mt-1 text-sm text-muted">Todos os condomínios atendidos pela plataforma. Os números são contados dentro de cada um.</p>
        </div>
        <Button variant="secondary" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw aria-hidden className={cn('size-4', query.isFetching && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat icon={Building2} label="Condomínios" value={loading ? <Skeleton className="h-7 w-12" /> : formatNumber(all.length)} hint={loading ? undefined : `${formatNumber(totals.active)} ativos`} />
        <Stat icon={Home} label="Unidades" value={loading ? <Skeleton className="h-7 w-12" /> : formatNumber(totals.houses)} hint="Casas e apartamentos ativos" />
        <Stat icon={Users} label="Moradores ativos" value={loading ? <Skeleton className="h-7 w-12" /> : formatNumber(totals.residents)} hint="Com acesso ao aplicativo" />
        <Stat icon={QrCode} label="Com Pix conectado" value={loading ? <Skeleton className="h-7 w-12" /> : formatNumber(totals.pix)} hint="Recebem pelo Asaas" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <label htmlFor="busca" className="sr-only">
              Buscar condomínio
            </label>
            <Input id="busca" type="search" placeholder="Buscar por nome" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div role="radiogroup" aria-label="Situação" className="flex rounded-lg border border-line bg-surface-alt p-0.5">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                role="radio"
                aria-checked={status === filter.value}
                onClick={() => setStatus(filter.value)}
                className={cn('rounded-md px-3 py-1.5 text-sm transition-colors', status === filter.value ? 'bg-surface font-medium text-ink shadow-sm' : 'text-muted hover:text-ink')}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {!loading && !query.isError && (
            <p className="ml-auto text-sm text-muted" aria-live="polite">
              {rows.length === all.length ? `${formatNumber(all.length)} condomínios` : `${formatNumber(rows.length)} de ${formatNumber(all.length)}`}
            </p>
          )}
        </div>

        {query.isError ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle aria-hidden className="size-5" />
            </span>
            <p className="font-medium">Não consegui carregar os condomínios</p>
            <p className="max-w-md text-sm text-muted">{query.error.message}</p>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Condomínios da plataforma</caption>
              <thead className="bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <SortHeader label="Condomínio" column="name" sort={sort} onSort={onSort} />
                  <th scope="col" className="px-4 py-3 font-medium">
                    Situação
                  </th>
                  <SortHeader label="Unidades" column="houses" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label="Moradores ativos" column="activeResidents" sort={sort} onSort={onSort} align="right" />
                  <th scope="col" className="px-4 py-3 font-medium">
                    Pix
                  </th>
                  <SortHeader label="Desde" column="createdAt" sort={sort} onSort={onSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading &&
                  Array.from({ length: 3 }, (_, index) => (
                    <tr key={index}>
                      {Array.from({ length: 6 }, (_, cell) => (
                        <td key={cell} className="px-4 py-4">
                          <Skeleton className="h-4 w-full max-w-32" />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!loading &&
                  rows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-surface-alt/50">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-sm font-semibold text-brand" aria-hidden>
                            {row.name.trim().charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.name}</p>
                            <p className="truncate font-mono text-xs text-muted">{row.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">{statusBadge(row.status)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{formatNumber(row.houses)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{formatNumber(row.activeResidents)}</td>
                      <td className="px-4 py-3.5">{row.pixConnected ? <Badge tone="brand">Conectado</Badge> : <Badge>Não conectado</Badge>}</td>
                      <td className="px-4 py-3.5 tabular-nums text-muted">{formatDate(row.createdAt)}</td>
                    </tr>
                  ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-sm text-muted">
                      {all.length === 0 ? 'Nenhum condomínio cadastrado ainda.' : 'Nenhum condomínio com esse filtro.'}
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
