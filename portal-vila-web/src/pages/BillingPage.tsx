import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  FileCheck2,
  FilePlus2,
  Landmark,
  Receipt,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  TriangleAlert
} from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CopyButton } from '@/components/ManagerCodeDialog';
import { FormAlert } from '@/components/PublicLayout';
import { Badge, Button, Card, Input, Skeleton, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { Field, PageHeader, Segmented } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, type BillingMonth, type BillingRow, type BillingStatus, type CondominiumSettings, type GenerateResult } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { cn, currentMonth, formatDate, formatMoney, formatNumber, monthName, moneyText, parseMoney, plural, shiftMonth, useDocumentTitle } from '@/lib/utils';

type Filter = 'all' | 'paid' | 'open' | 'late' | 'none';

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'paid', label: 'Pagas' },
  { value: 'open', label: 'Em aberto' },
  { value: 'late', label: 'Vencidas' },
  { value: 'none', label: 'Sem cobrança' }
];

const matches: Record<Filter, (status: BillingStatus) => boolean> = {
  all: () => true,
  paid: (status) => status === 'PAID',
  open: (status) => status === 'PENDING',
  late: (status) => status === 'OVERDUE',
  none: (status) => status === 'NOT_CHARGED' || status === 'NO_RESIDENT' || status === 'CANCELLED'
};

function StatusBadge({ row }: { row: BillingRow }) {
  switch (row.status) {
    case 'PAID':
      return <Badge tone="ok">Paga</Badge>;
    case 'PENDING':
      return <Badge tone="brand">Em aberto</Badge>;
    case 'OVERDUE':
      return <Badge tone="danger">Vencida</Badge>;
    case 'CANCELLED':
      return <Badge>Cancelada</Badge>;
    case 'NOT_CHARGED':
      return <Badge tone="warn">Sem cobrança</Badge>;
    default:
      return <Badge>Sem morador</Badge>;
  }
}

function Kpi({ icon: Icon, label, value, detail, tone }: { icon: typeof Receipt; label: string; value: ReactNode; detail: ReactNode; tone: 'brand' | 'ok' | 'warn' | 'danger' }) {
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
      <div className="mt-1 text-xs text-muted">{detail}</div>
    </Card>
  );
}

/** A cancelled charge the unit already has again this month (same thing, not cancelled): no second "charge again". */
function chargedAgain(cancelled: BillingRow, rows: BillingRow[], chargeTitle: string) {
  const what = cancelled.description ?? chargeTitle;
  return rows.some(
    (row) => row.houseId === cancelled.houseId && row.contributionId !== cancelled.contributionId && row.status !== 'CANCELLED' && (row.description ?? chargeTitle) === what
  );
}

/** Today in this computer's calendar, as "2026-10-28". */
function isoToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function rulesSummary(settings: CondominiumSettings | undefined) {
  if (!settings) return '…';
  const parts = [settings.billingType === 'BOLETO' ? 'Boleto com Pix' : 'Pix'];
  const percent = (value: number) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  parts.push(Number(settings.finePercent) > 0 ? `multa de ${percent(settings.finePercent)}%` : 'sem multa');
  parts.push(Number(settings.interestPercent) > 0 ? `juros de ${percent(settings.interestPercent)}% ao mês` : 'sem juros');
  if (Number(settings.reserveFundPercent) > 0) parts.push(`fundo de reserva de ${percent(settings.reserveFundPercent)}%`);
  return parts.join(' · ');
}

/** What a batch did: how many charges went out, and each unit that failed or was left out, with the reason. */
function ResultDialog({ open, result, onClose }: { open: boolean; result: GenerateResult; onClose: () => void }) {
  const problems = result.failed.length + result.skipped.length;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      tone={result.failed.length > 0 ? 'danger' : 'ok'}
      icon={result.failed.length > 0 ? <TriangleAlert aria-hidden className="size-5" /> : <CheckCircle2 aria-hidden className="size-5" />}
      title={result.created > 0 ? `${plural(result.created, 'cobrança criada', 'cobranças criadas')}` : 'Nenhuma cobrança nova'}
      description={
        <>
          Mês de {monthName(result.month)}.
          {result.alreadyCharged > 0 &&
            ` ${plural(result.alreadyCharged, 'unidade já tinha cobrança e ficou como estava', 'unidades já tinham cobrança e ficaram como estavam')}.`}
          {result.created > 0 && ' Os moradores já veem a cobrança no aplicativo.'}
        </>
      }
      footer={<Button onClick={onClose}>Concluir</Button>}
    >
      {problems > 0 && (
        <div className="space-y-4">
          {result.failed.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-danger">Não foi possível cobrar</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {result.failed.map((problem) => (
                  <li key={problem.houseLabel} className="px-4 py-3 text-sm">
                    <p className="font-medium">{problem.houseLabel}</p>
                    <p className="text-muted">{problem.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.skipped.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Ficaram de fora</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {result.skipped.map((problem) => (
                  <li key={problem.houseLabel} className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                    <span className="font-medium">{problem.houseLabel}</span>
                    <span className="text-muted">{problem.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** Where a one-off charge starts: for every unit, or one unit already chosen (charging again a cancelled charge). */
type ExtraStart = { houseId: number | null; description: string; amount: number | null; dueDate: string | null };

/**
 * A one-off charge ("Chamada de capital: pintura"): for every unit with a resident or one unit, with its own value and
 * due date. It goes next to the month's own charge and never takes its place.
 */
function ExtraDialog({ start, rows, onClose }: { start: ExtraStart; rows: BillingRow[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const today = isoToday();
  const units = useMemo(() => {
    const seen = new Map<number, string>();
    rows.filter((row) => row.status !== 'NO_RESIDENT').forEach((row) => seen.set(row.houseId, row.houseLabel));
    return [...seen.entries()].map(([houseId, label]) => ({ houseId, label }));
  }, [rows]);
  const [target, setTarget] = useState<'all' | 'one'>(start.houseId == null ? 'all' : 'one');
  const [houseId, setHouseId] = useState<number | null>(start.houseId ?? units[0]?.houseId ?? null);
  const [description, setDescription] = useState(start.description);
  const [amount, setAmount] = useState(moneyText(start.amount));
  const [dueDate, setDueDate] = useState(start.dueDate && start.dueDate >= today ? start.dueDate : today);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const value = parseMoney(amount);
  const count = target === 'all' ? units.length : 1;
  const errors = {
    description: description.trim().length < 3 || description.trim().length > 80 ? 'Diga para que é, em 3 a 80 letras.' : null,
    amount: value == null || Number.isNaN(value) || value <= 0 ? 'Informe um valor maior que zero.' : null,
    dueDate: !dueDate || dueDate < today ? 'Escolha um dia de hoje em diante.' : null,
    unit: target === 'one' && houseId == null ? 'Escolha a unidade.' : null
  };
  const valid = Object.values(errors).every((error) => !error) && count > 0;

  const charge = useMutation({
    mutationFn: () =>
      api.extraCharge({ houseId: target === 'all' ? null : houseId, description: description.trim(), amount: value as number, dueDate }),
    onSuccess: (answer) => {
      setResult(answer);
      queryClient.invalidateQueries({ queryKey: ['condo'] });
    }
  });

  function close() {
    if (!charge.isPending) onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) charge.mutate();
  }

  if (result) return <ResultDialog open result={result} onClose={close} />;

  return (
    <Dialog
      open
      onClose={close}
      icon={<FilePlus2 aria-hidden className="size-5" />}
      title={start.houseId == null ? 'Cobrança avulsa' : 'Cobrar de novo'}
      description={
        start.houseId == null
          ? 'Para o que não é a mensalidade: chamada de capital, conserto, multa. Ela vai além da cobrança do mês.'
          : 'Uma cobrança nova para a unidade, no lugar da que foi cancelada. Confira o valor e o vencimento.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={charge.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="cobranca-avulsa" disabled={charge.isPending || !valid}>
            {charge.isPending ? <Spinner /> : <Send aria-hidden className="size-4" />}
            {charge.isPending ? 'Gerando…' : `Gerar ${plural(count, 'cobrança', 'cobranças')}`}
          </Button>
        </>
      }
    >
      <form id="cobranca-avulsa" onSubmit={submit} noValidate className="space-y-4">
        {charge.isError && <FormAlert>{charge.error.message}</FormAlert>}
        {start.houseId == null && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Para quem</p>
            <Segmented
              label="Para quem"
              value={target}
              onChange={setTarget}
              options={[
                { value: 'all', label: `Todas as unidades (${units.length})` },
                { value: 'one', label: 'Uma unidade' }
              ]}
            />
          </div>
        )}
        {target === 'one' && (
          <Field label="Unidade" htmlFor="unidade-avulsa" error={errors.unit}>
            <select
              id="unidade-avulsa"
              value={houseId ?? ''}
              onChange={(e) => setHouseId(Number(e.target.value))}
              className="h-10 w-full rounded-lg border border-line-strong/60 bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            >
              {units.map((unit) => (
                <option key={unit.houseId} value={unit.houseId}>
                  {unit.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Para que é" htmlFor="descricao-avulsa" error={errors.description} hint="Aparece na fatura e no aplicativo.">
          <Input
            id="descricao-avulsa"
            data-autofocus
            maxLength={80}
            placeholder="Chamada de capital: pintura da fachada"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor por unidade" htmlFor="valor-avulsa" error={errors.amount}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
              <Input id="valor-avulsa" inputMode="decimal" className="pl-9 tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </Field>
          <Field label="Vencimento" htmlFor="vencimento-avulsa" error={errors.dueDate}>
            <Input id="vencimento-avulsa" type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        {target === 'all' && value != null && !Number.isNaN(value) && value > 0 && units.length > 0 && (
          <p className="rounded-lg bg-surface-alt/70 px-3 py-2 text-sm text-muted">
            Total: <strong className="font-semibold text-ink tabular-nums">{formatMoney(value * units.length)}</strong> em{' '}
            {plural(units.length, 'unidade', 'unidades')}.
          </p>
        )}
      </form>
    </Dialog>
  );
}

/** Issuing the month: the value and the due date, how many units get a charge, and then what happened unit by unit. */
function GenerateDialog({ open, month, onClose }: { open: boolean; month: BillingMonth; onClose: () => void }) {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['condo', 'settings'], queryFn: api.settings, enabled: open });
  // Asaas takes no due date in the past: from today on, inside the month.
  const today = isoToday();
  const [year, number] = month.month.split('-').map(Number);
  const last = `${month.month}-${String(new Date(year, number, 0).getDate()).padStart(2, '0')}`;
  const first = `${month.month}-01` > today ? `${month.month}-01` : today;
  const monthOver = last < today;
  const [amount, setAmount] = useState(moneyText(month.monthlyAmount));
  const [dueDate, setDueDate] = useState(month.dueDate < today ? today : month.dueDate);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const value = parseMoney(amount);
  const errors = {
    amount: value == null || Number.isNaN(value) || value <= 0 ? 'Informe um valor maior que zero.' : null,
    dueDate: monthOver
      ? 'Esse mês já passou: não dá para cobrar com vencimento no passado.'
      : !dueDate || dueDate < first || dueDate > last
        ? `Escolha um dia de hoje até ${formatDate(last)}.`
        : null
  };

  const generate = useMutation({
    mutationFn: () => api.generateCharges({ month: month.month, amount: value as number, dueDate }),
    onSuccess: (answer) => {
      setResult(answer);
      queryClient.invalidateQueries({ queryKey: ['condo'] });
    }
  });

  function close() {
    if (generate.isPending) return;
    setResult(null);
    generate.reset();
    onClose();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!errors.amount && !errors.dueDate) generate.mutate();
  }

  if (result) return <ResultDialog open={open} result={result} onClose={close} />;

  return (
    <Dialog
      open={open}
      onClose={close}
      icon={<Send aria-hidden className="size-5" />}
      title={`Gerar as cobranças de ${monthName(month.month)}`}
      description={
        month.unitsToCharge > 0
          ? `${plural(month.unitsToCharge, 'unidade com morador ainda não tem', 'unidades com morador ainda não têm')} cobrança neste mês. Quem já tem fica como está.`
          : 'Todas as unidades com morador já têm a cobrança deste mês.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={generate.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="gerar-cobrancas" disabled={generate.isPending || month.unitsToCharge === 0 || !!errors.amount || !!errors.dueDate}>
            {generate.isPending ? <Spinner /> : <Send aria-hidden className="size-4" />}
            {generate.isPending ? 'Gerando…' : `Gerar ${plural(month.unitsToCharge, 'cobrança', 'cobranças')}`}
          </Button>
        </>
      }
    >
      <form id="gerar-cobrancas" onSubmit={submit} noValidate className="space-y-4">
        {generate.isError && <FormAlert>{generate.error.message}</FormAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Valor por unidade"
            htmlFor="valor-cobranca"
            error={errors.amount}
            hint={
              value && !errors.amount && Number(settings.data?.reserveFundPercent) > 0
                ? `+ ${formatMoney((value * Number(settings.data!.reserveFundPercent)) / 100)} de fundo de reserva = ${formatMoney(
                    value * (1 + Number(settings.data!.reserveFundPercent) / 100)
                  )}`
                : undefined
            }
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
              <Input id="valor-cobranca" data-autofocus inputMode="decimal" className="pl-9 tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </Field>
          <Field label="Vencimento" htmlFor="vencimento-cobranca" error={errors.dueDate}>
            <Input id="vencimento-cobranca" type="date" min={first} max={last} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface-alt/60 p-3.5 text-sm">
          <div>
            <p className="font-medium">{rulesSummary(settings.data)}</p>
            <p className="text-xs text-muted">Como foi definido em Configurações. Vale para as cobranças novas.</p>
          </div>
          <Link to="/condominio/configuracoes" className="shrink-0 text-sm font-medium text-brand hover:underline">
            Mudar
          </Link>
        </div>
      </form>
    </Dialog>
  );
}

function CancelDialog({ row, onClose }: { row: BillingRow | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () => api.cancelCharge(row!.chargeId!, reason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['condo'] });
      notify('ok', `Cobrança de ${row!.houseLabel} cancelada.`);
      setReason('');
      onClose();
    }
  });
  const tooShort = reason.trim().length < 3;

  return (
    <Dialog
      open={row !== null}
      onClose={() => !cancel.isPending && onClose()}
      tone="danger"
      icon={<Ban aria-hidden className="size-5" />}
      title={row ? `Cancelar a cobrança de ${row.houseLabel}?` : 'Cancelar a cobrança?'}
      description="Ela é cancelada também no Asaas: o Pix e o boleto deixam de valer. O motivo fica na auditoria."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={cancel.isPending}>
            Voltar
          </Button>
          <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending || tooShort}>
            {cancel.isPending && <Spinner />}
            Cancelar cobrança
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {cancel.isError && <FormAlert>{cancel.error.message}</FormAlert>}
        <Field label="Motivo" htmlFor="motivo-cancelamento" hint="Por exemplo: valor errado, unidade desocupada, pago em dinheiro.">
          <Input id="motivo-cancelamento" data-autofocus maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function RowActions({
  row,
  onCancel,
  onChargeAgain
}: {
  row: BillingRow;
  onCancel: (row: BillingRow) => void;
  /** Absent when the unit was already charged again for the same thing. */
  onChargeAgain?: (row: BillingRow) => void;
}) {
  if (row.status === 'CANCELLED' && row.residentName && onChargeAgain) {
    return (
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => onChargeAgain(row)} aria-label={`Cobrar de novo ${row.houseLabel}`}>
          <RotateCcw aria-hidden className="size-4" />
          Cobrar de novo
        </Button>
      </div>
    );
  }
  if ((row.status === 'PENDING' || row.status === 'OVERDUE') && row.chargeId) {
    return (
      <div className="flex justify-end gap-2">
        {row.invoiceUrl && (
          <>
            <CopyButton text={row.invoiceUrl} label="Copiar link" />
            <a
              href={row.invoiceUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir a fatura de ${row.houseLabel}`}
              title="Abrir a fatura (Pix e boleto)"
              className="grid size-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:bg-surface-alt hover:text-ink"
            >
              <ExternalLink aria-hidden className="size-4" />
            </a>
          </>
        )}
        <Button variant="ghost" size="sm" onClick={() => onCancel(row)} aria-label={`Cancelar a cobrança de ${row.houseLabel}`} className="text-danger hover:bg-danger-soft hover:text-danger">
          <Ban aria-hidden className="size-4" />
          <span className="hidden xl:inline">Cancelar</span>
        </Button>
      </div>
    );
  }
  if (row.status === 'PAID' && row.receiptUrl) {
    return (
      <div className="flex justify-end">
        <a href={row.receiptUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
          <FileCheck2 aria-hidden className="size-4" />
          Comprovante
        </a>
      </div>
    );
  }
  return null;
}

/** The month's charges: what each unit owes, paid or not, issuing the month at once, and the link to pay again. */
export function BillingPage() {
  const me = useSession();
  const condominium = me.condominium!;
  useDocumentTitle('Cobranças');
  const queryClient = useQueryClient();
  const notify = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [cancelling, setCancelling] = useState<BillingRow | null>(null);
  const [extra, setExtra] = useState<ExtraStart | null>(null);
  const billing = useQuery({ queryKey: ['condo', 'billing', month], queryFn: () => api.billing(month) });
  const settings = useQuery({ queryKey: ['condo', 'settings'], queryFn: api.settings });
  const chargeTitle = settings.data?.chargeTitle ?? 'Taxa condominial';
  const data = billing.data;

  const reconcile = useMutation({
    mutationFn: () => api.reconcileCharges(month),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['condo'] });
      notify('ok', 'Conferido com o Asaas: as situações estão em dia.');
    },
    onError: (error) => notify('danger', error.message)
  });

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return (data?.rows ?? [])
      .filter((row) => matches[filter](row.status))
      .filter((row) => !term || row.houseLabel.toLocaleLowerCase('pt-BR').includes(term) || (row.residentName ?? '').toLocaleLowerCase('pt-BR').includes(term));
  }, [data, filter, search]);

  const totals = data?.totals;
  const share = totals && Number(totals.expected) > 0 ? Math.min(100, Math.round((Number(totals.received) / Number(totals.expected)) * 100)) : 0;
  const loading = billing.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: condominium.name, to: '/condominio' }, { label: 'Cobranças' }]}
        title="Cobranças"
        description="As mensalidades de cada unidade, mês a mês: quem pagou, o que está em aberto e o link para pagar."
        actions={
          <>
            <Button variant="secondary" onClick={() => reconcile.mutate()} disabled={reconcile.isPending || !data?.pixConnected}>
              {reconcile.isPending ? <Spinner /> : <RefreshCw aria-hidden className="size-4" />}
              Conferir com o Asaas
            </Button>
            <Button
              variant="secondary"
              onClick={() => setExtra({ houseId: null, description: '', amount: null, dueDate: null })}
              disabled={!data?.pixConnected}
            >
              <FilePlus2 aria-hidden className="size-4" />
              Cobrança avulsa
            </Button>
            <Button onClick={() => setGenerating(true)} disabled={!data?.pixConnected || data.unitsToCharge === 0}>
              <Send aria-hidden className="size-4" />
              Gerar cobranças
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-lg border border-line bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Mês anterior"
            className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-ink"
          >
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <p aria-live="polite" className="min-w-40 px-2 text-center text-sm font-medium first-letter:uppercase">
            {monthName(month)}
          </p>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Próximo mês"
            className="grid size-8 place-items-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-ink"
          >
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
        {month !== currentMonth() && (
          <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonth())}>
            Voltar para este mês
          </Button>
        )}
      </div>

      {data && !data.pixConnected && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn">
          <Landmark aria-hidden className="size-4 shrink-0" />
          <p className="min-w-0 flex-1">
            <strong className="font-semibold">Conecte a conta Asaas do condomínio para cobrar.</strong> É por ela que saem o Pix e o boleto, e que os pagamentos
            voltam para cá sozinhos.
          </p>
          <Link to="/condominio/configuracoes#pix" className="font-medium underline-offset-2 hover:underline">
            Conectar agora
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi
          icon={Receipt}
          label="Previsto no mês"
          tone="brand"
          value={loading ? <Skeleton className="h-7 w-28" /> : formatMoney(totals?.expected)}
          detail={
            loading
              ? '…'
              : plural((totals?.paid ?? 0) + (totals?.pending ?? 0) + (totals?.late ?? 0), 'cobrança', 'cobranças') +
                (Number(totals?.reserve) > 0 ? ` · ${formatMoney(totals?.reserve)} de fundo de reserva` : '')
          }
        />
        <Kpi
          icon={CircleDollarSign}
          label="Recebido"
          tone="ok"
          value={loading ? <Skeleton className="h-7 w-28" /> : formatMoney(totals?.received)}
          detail={
            loading ? (
              '…'
            ) : (
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-alt">
                  <span className="block h-full rounded-full bg-ok" style={{ width: `${share}%` }} />
                </span>
                {share}% do previsto
              </span>
            )
          }
        />
        <Kpi
          icon={CalendarClock}
          label="Em aberto"
          tone="warn"
          value={loading ? <Skeleton className="h-7 w-28" /> : formatMoney(totals?.open)}
          detail={loading ? '…' : `${plural(totals?.pending ?? 0, 'unidade', 'unidades')} a vencer`}
        />
        <Kpi
          icon={AlertTriangle}
          label="Vencido"
          tone="danger"
          value={loading ? <Skeleton className="h-7 w-28" /> : formatMoney(totals?.overdue)}
          detail={loading ? '…' : `${plural(totals?.late ?? 0, 'unidade', 'unidades')} em atraso`}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <label htmlFor="busca-cobranca" className="sr-only">
              Buscar unidade ou morador
            </label>
            <Input id="busca-cobranca" type="search" placeholder="Buscar unidade ou morador" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Segmented label="Mostrar" value={filter} options={filters} onChange={setFilter} />
        </div>

        {billing.isError ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle aria-hidden className="size-5" />
            </span>
            <p className="font-medium">Não consegui carregar as cobranças</p>
            <p className="max-w-md text-sm text-muted">{billing.error.message}</p>
            <Button variant="secondary" onClick={() => billing.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          // relative: the screen-reader-only labels inside are placed against the table, not the page (no sideways page scroll).
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Cobranças de {monthName(month)}</caption>
              <thead className="bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Unidade</th>
                  <th scope="col" className="px-4 py-3 font-medium">Morador</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Valor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Vencimento</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading &&
                  [0, 1, 2, 3].map((index) => (
                    <tr key={index}>
                      {[0, 1, 2, 3, 4, 5].map((cell) => (
                        <td key={cell} className="px-4 py-4">
                          <Skeleton className="h-4 w-full max-w-28" />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!loading &&
                  visible.map((row) => (
                    <tr key={`${row.houseId}-${row.contributionId ?? 'sem'}`} className="transition-colors hover:bg-surface-alt/50">
                      <td className="px-4 py-3.5">
                        <span className="font-medium">{row.houseLabel}</span>
                        {row.extra && (
                          <Badge tone="neutral" className="ml-2">
                            Avulsa
                          </Badge>
                        )}
                        {row.description && <p className="max-w-56 truncate text-xs text-muted">{row.description}</p>}
                      </td>
                      <td className="max-w-56 truncate px-4 py-3.5">{row.residentName ?? <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        {row.amount == null ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <>
                            {formatMoney(row.status === 'PAID' && row.paidAmount ? row.paidAmount : row.amount)}
                            {row.status === 'PAID' && row.paidAmount != null && Number(row.paidAmount) > Number(row.amount) && (
                              <p className="text-xs text-muted">com multa e juros</p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">{row.dueDate ? formatDate(row.dueDate) : <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3.5">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <StatusBadge row={row} />
                          {row.status === 'PAID' && row.paidAt && <span className="text-xs text-muted">em {formatDate(row.paidAt)}</span>}
                          {row.manual && <span className="text-xs text-muted">registrada à mão</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <RowActions
                          row={row}
                          onCancel={setCancelling}
                          onChargeAgain={
                            chargedAgain(row, data?.rows ?? [], chargeTitle)
                              ? undefined
                              : (cancelled) =>
                                  setExtra({ houseId: cancelled.houseId, description: cancelled.description ?? chargeTitle, amount: cancelled.amount, dueDate: cancelled.dueDate })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-sm text-muted">
                      {(data?.rows.length ?? 0) === 0 ? 'Nenhuma unidade cadastrada ainda.' : 'Nenhuma unidade com esse filtro.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data && data.rows.length > 0 && (
          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            {formatNumber(data.rows.length)} {data.rows.length === 1 ? 'linha' : 'linhas'}. O link de cada cobrança é a segunda via: abre a fatura com o Pix
            {' '}e, se o condomínio cobra por boleto, o boleto.
          </p>
        )}
      </Card>

      {data && generating && <GenerateDialog open={generating} month={data} onClose={() => setGenerating(false)} />}
      <CancelDialog row={cancelling} onClose={() => setCancelling(null)} />
      {extra && data && <ExtraDialog start={extra} rows={data.rows} onClose={() => setExtra(null)} />}
    </div>
  );
}
