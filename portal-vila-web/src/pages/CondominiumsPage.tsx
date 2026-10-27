import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Building2, ChevronRight, Home, Plus, QrCode, RefreshCw, Search, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NewCondominiumDialog } from '@/components/NewCondominiumDialog';
import { Badge, Button, Card, Input, Skeleton } from '@/components/ui';
import { Monogram, PageHeader, Segmented } from '@/components/ui/page';
import { api, type CondominiumSummary } from '@/lib/api';
import { cn, formatDate, formatNumber, initials } from '@/lib/utils';

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
  const [creating, setCreating] = useState(false);

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
      <PageHeader
        title="Condomínios"
        description="Todos os condomínios atendidos pela plataforma. Os números são contados dentro de cada um."
        actions={
          <>
            <Button variant="secondary" onClick={() => query.refetch()} disabled={query.isFetching} aria-label="Atualizar a lista">
              <RefreshCw aria-hidden className={cn('size-4', query.isFetching && 'animate-spin')} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden className="size-4" />
              Novo condomínio
            </Button>
          </>
        }
      />
      <NewCondominiumDialog open={creating} onClose={() => setCreating(false)} />

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
          <Segmented label="Situação" value={status} options={filters} onChange={setStatus} />
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
                  <th scope="col" className="w-10 px-2 py-3">
                    <span className="sr-only">Abrir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading &&
                  Array.from({ length: 3 }, (_, index) => (
                    <tr key={index}>
                      {Array.from({ length: 7 }, (_, cell) => (
                        <td key={cell} className="px-4 py-4">
                          <Skeleton className="h-4 w-full max-w-32" />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!loading &&
                  rows.map((row) => (
                    <tr key={row.id} className="group relative transition-colors hover:bg-surface-alt/60 focus-within:bg-surface-alt/60">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Monogram text={initials(row.name)} />
                          <div className="min-w-0">
                            {/* The link covers the whole row: click anywhere, or Tab to it. */}
                            <Link
                              to={`/condominios/${row.id}`}
                              className="block truncate font-medium after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
                            >
                              {row.name}
                            </Link>
                            <p className="truncate font-mono text-xs text-muted">{row.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">{statusBadge(row.status)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{formatNumber(row.houses)}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums">{formatNumber(row.activeResidents)}</td>
                      <td className="px-4 py-3.5">{row.pixConnected ? <Badge tone="brand">Conectado</Badge> : <Badge>Não conectado</Badge>}</td>
                      <td className="px-4 py-3.5 tabular-nums text-muted">{formatDate(row.createdAt)}</td>
                      <td className="px-2 py-3.5 text-muted">
                        <ChevronRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                      </td>
                    </tr>
                  ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-14 text-center">
                      {all.length === 0 ? (
                        <div className="flex flex-col items-center gap-3">
                          <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
                            <Building2 aria-hidden className="size-5" />
                          </span>
                          <p className="font-medium">Nenhum condomínio ainda</p>
                          <Button onClick={() => setCreating(true)}>
                            <Plus aria-hidden className="size-4" />
                            Criar o primeiro
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted">Nenhum condomínio com esse filtro.</p>
                      )}
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
