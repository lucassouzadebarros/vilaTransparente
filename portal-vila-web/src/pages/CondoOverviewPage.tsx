import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCircle2, Circle, ExternalLink, Home, Landmark, TrendingUp, Users, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Card, Skeleton } from '@/components/ui';
import { PageHeader } from '@/components/ui/page';
import { api, RESIDENTS_APP_URL } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { cn, currentMonth, formatDate, formatMoney, formatNumber, monthName, plural, useDocumentTitle } from '@/lib/utils';

const INFLOWS = new Set(['PIX_ASAAS', 'PAGAMENTO_MANUAL', 'RECEBIMENTO_DIRETO']);

function Kpi({ icon: Icon, label, value, detail, tone = 'brand' }: { icon: typeof Wallet; label: string; value: ReactNode; detail?: ReactNode; tone?: 'brand' | 'ok' | 'warn' }) {
  const tones = { brand: 'bg-brand-soft text-brand', ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn' };
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

function Step({ done, title, children, to }: { done: boolean; title: string; children: ReactNode; to?: string }) {
  return (
    <li className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
      {done ? <CheckCircle2 aria-label="Feito" className="mt-0.5 size-5 shrink-0 text-ok" /> : <Circle aria-label="Pendente" className="mt-0.5 size-5 shrink-0 text-line-strong" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <div className="mt-0.5 text-sm text-muted">{children}</div>
      </div>
      {to && !done && (
        <Link to={to} className="self-center text-sm font-medium text-brand hover:underline">
          Fazer
        </Link>
      )}
    </li>
  );
}

/** The condominium at a glance: the month's money, what is missing to run well, and the latest movements. */
export function CondoOverviewPage() {
  const me = useSession();
  const condominium = me.condominium!;
  useDocumentTitle('Visão geral');
  const month = currentMonth();
  const dashboard = useQuery({ queryKey: ['condo', 'dashboard', month], queryFn: () => api.dashboard(month) });
  const houses = useQuery({ queryKey: ['condo', 'houses'], queryFn: api.houses });
  const settings = useQuery({ queryKey: ['condo', 'settings'], queryFn: api.settings });

  const data = dashboard.data;
  const totalHouses = data ? data.paidHouses + data.pendingHouses : 0;
  const paidShare = totalHouses > 0 && data ? Math.round((data.paidHouses / totalHouses) * 100) : 0;
  const occupied = houses.data?.filter((house) => !house.available).length ?? 0;
  const loading = dashboard.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title={condominium.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {condominium.status === 'ACTIVE' ? <Badge tone="ok">Ativo</Badge> : <Badge tone="warn">Suspenso</Badge>}
            <span>Visão geral de {monthName(month)}</span>
          </span>
        }
        actions={
          <a
            href={RESIDENTS_APP_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-alt"
          >
            <ExternalLink aria-hidden className="size-4" /> Abrir o aplicativo
          </a>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi
          icon={Landmark}
          label="Saldo acumulado"
          value={loading ? <Skeleton className="h-7 w-28" /> : <span className={cn(Number(data?.balance ?? 0) < 0 && 'text-danger')}>{formatMoney(data?.balance)}</span>}
          detail={Number(data?.balance ?? 0) < 0 ? 'Saiu mais do que entrou até agora' : 'Tudo o que entrou menos o que saiu'}
        />
        <Kpi icon={TrendingUp} tone="ok" label="Arrecadado no mês" value={loading ? <Skeleton className="h-7 w-24" /> : formatMoney(data?.collected)} detail={loading ? undefined : `Total desde o início: ${formatMoney(data?.totalCollected)}`} />
        <Kpi
          icon={Wallet}
          tone="warn"
          label="Em aberto no mês"
          value={loading ? <Skeleton className="h-7 w-24" /> : formatMoney(Number(data?.pending ?? 0) + Number(data?.overdue ?? 0))}
          detail={loading ? undefined : Number(data?.overdue ?? 0) > 0 ? `${formatMoney(data?.overdue)} já vencido` : 'Nada vencido'}
        />
        <Kpi
          icon={Users}
          label="Unidades em dia"
          value={loading ? <Skeleton className="h-7 w-16" /> : totalHouses > 0 ? `${formatNumber(data?.paidHouses ?? 0)}/${formatNumber(totalHouses)}` : '—'}
          detail={
            loading ? undefined : totalHouses > 0 ? (
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-alt" aria-label={`${paidShare}% das unidades pagaram`}>
                <span className="block h-full rounded-full bg-ok" style={{ width: `${paidShare}%` }} />
              </span>
            ) : (
              'Nenhuma cobrança gerada neste mês'
            )
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-base font-semibold">Configuração</h2>
          <p className="mt-1 text-sm text-muted">O que o condomínio precisa para funcionar bem.</p>
          <ol className="mt-5 divide-y divide-line">
            <Step done={(houses.data?.length ?? 0) > 0} title="Unidades" to="/condominio/unidades">
              {houses.isPending ? '…' : plural(houses.data?.length ?? 0, 'unidade cadastrada', 'unidades cadastradas')}
            </Step>
            <Step done={occupied > 0} title="Moradores com acesso" to="/condominio/unidades">
              {houses.isPending ? '…' : occupied > 0 ? `${plural(occupied, 'unidade', 'unidades')} com morador` : 'Gere os convites das unidades para os moradores entrarem.'}
            </Step>
            <Step done={Number(settings.data?.monthlyAmount ?? 0) > 0} title="Mensalidade" to="/condominio/configuracoes">
              {settings.data ? `${formatMoney(settings.data.monthlyAmount)}, vence todo dia ${settings.data.paymentDueDay}` : '…'}
            </Step>
            <Step done={condominium.pixConnected} title="Pagamentos por Pix">
              {condominium.pixConnected
                ? 'Conta Asaas conectada: as mensalidades saem por Pix.'
                : 'Ainda não conectado. A conexão com a conta Asaas do condomínio chega na próxima etapa do painel.'}
            </Step>
          </ol>
        </Card>

        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between gap-3 p-6 pb-3">
            <div>
              <h2 className="text-base font-semibold">Últimos lançamentos</h2>
              <p className="mt-1 text-sm text-muted">Entradas e saídas mais recentes do caixa.</p>
            </div>
            <a href={RESIDENTS_APP_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              Ver caixa <ArrowRight aria-hidden className="size-4" />
            </a>
          </div>
          {loading ? (
            <div className="space-y-3 px-6 pb-6">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : (data?.movements.length ?? 0) === 0 ? (
            <p className="mx-6 mb-6 rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-muted">Nenhum lançamento ainda.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data!.movements.slice(0, 8).map((movement, index) => {
                const inflow = INFLOWS.has(movement.type);
                return (
                  <li key={`${movement.date}-${index}`} className="flex items-center gap-3 px-6 py-3">
                    <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', inflow ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')}>
                      {inflow ? <ArrowDownLeft aria-hidden className="size-4" /> : <ArrowUpRight aria-hidden className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{movement.description}</p>
                      <p className="text-xs text-muted">{formatDate(movement.date)}</p>
                    </div>
                    <p className={cn('text-sm font-semibold tabular-nums', inflow ? 'text-ok' : 'text-ink')}>
                      {inflow ? '+' : '−'} {formatMoney(Math.abs(Number(movement.amount)))}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <Home aria-hidden className="size-5" />
          </span>
          <div>
            <p className="text-sm font-medium">Despesas, orçamentos, votações, serviços e relatos</p>
            <p className="text-sm text-muted">Por enquanto ficam no aplicativo; vêm para o painel nas próximas etapas.</p>
          </div>
        </div>
        <a href={RESIDENTS_APP_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
          Abrir o aplicativo <ArrowRight aria-hidden className="size-4" />
        </a>
      </Card>
    </div>
  );
}
