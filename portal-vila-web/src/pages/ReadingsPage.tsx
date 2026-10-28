import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Droplets, Flame, Gauge, Receipt, Save, Send } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { isoToday, ResultDialog } from '@/components/ChargeResultDialog';
import { FormAlert } from '@/components/PublicLayout';
import { Badge, Button, Card, Input, Skeleton, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { Field, PageHeader, Segmented } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, type GenerateResult, type MeterKind, type ReadingRow, type ReadingsView } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { cn, currentMonth, formatMoney, monthName, parseMoney, plural, shiftMonth, useDocumentTitle } from '@/lib/utils';

const kinds: { value: MeterKind; label: string }[] = [
  { value: 'WATER', label: 'Água' },
  { value: 'GAS', label: 'Gás' }
];

/** 12.5 -> "12,5"; empty -> "". */
function numberText(value: number | null | undefined, digits = 3) {
  return value == null
    ? ''
    : Number(value).toLocaleString('pt-BR', {
        maximumFractionDigits: digits,
        useGrouping: false
      });
}

function cubic(value: number) {
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} m³`;
}

function ChargeBadge({ status }: { status: string | null }) {
  if (status === 'PAID') return <Badge tone="ok">Cobrada · paga</Badge>;
  if (status === 'CANCELLED') return <Badge>Cobrada · cancelada</Badge>;
  if (status === 'OVERDUE') return <Badge tone="danger">Cobrada · vencida</Badge>;
  return <Badge tone="brand">Cobrada</Badge>;
}

function Total({ icon: Icon, label, children }: { icon: typeof Gauge; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
        <Icon aria-hidden className="size-4" />
      </span>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="font-semibold tabular-nums">{children}</p>
      </div>
    </div>
  );
}

/** Charging what each unit used: the due date, how many units and how much, then what happened unit by unit. */
function ChargeDialog({ view, onClose }: { view: ReadingsView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const today = isoToday();
  const [dueDate, setDueDate] = useState(today);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const pending = view.rows.filter((row) => row.contributionId == null && row.amount != null && Number(row.amount) > 0);
  const total = pending.reduce((sum, row) => sum + Number(row.amount), 0);
  const error = !dueDate || dueDate < today ? 'Escolha um dia de hoje em diante.' : null;

  const charge = useMutation({
    mutationFn: () => api.chargeReadings(view.month, view.kind, dueDate),
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
    if (!error) charge.mutate();
  }

  if (result) return <ResultDialog open result={result} onClose={close} />;

  const label = view.kind === 'WATER' ? 'água' : 'gás';
  return (
    <Dialog
      open
      onClose={close}
      icon={<Send aria-hidden className="size-5" />}
      title={`Cobrar o consumo de ${label} de ${monthName(view.month)}`}
      description={`${plural(pending.length, 'unidade', 'unidades')}, ${formatMoney(total)} no total. Cada uma recebe uma cobrança avulsa, ao lado da mensalidade.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={charge.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="cobrar-consumo" disabled={charge.isPending || !!error || pending.length === 0}>
            {charge.isPending ? <Spinner /> : <Send aria-hidden className="size-4" />}
            {charge.isPending ? 'Gerando…' : `Gerar ${plural(pending.length, 'cobrança', 'cobranças')}`}
          </Button>
        </>
      }
    >
      <form id="cobrar-consumo" onSubmit={submit} noValidate className="space-y-4">
        {charge.isError && <FormAlert>{charge.error.message}</FormAlert>}
        <Field label="Vencimento" htmlFor="vencimento-consumo" error={error}>
          <Input id="vencimento-consumo" data-autofocus type="date" min={today} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

type Draft = Record<number, { previous: string; reading: string }>;

/** The month's table: what is typed here only counts after "Salvar leituras"; a charged reading is locked. */
function ReadingsEditor({ view }: { view: ReadingsView }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [price, setPrice] = useState(
    view.unitPrice == null
      ? ''
      : Number(view.unitPrice).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
          useGrouping: false
        })
  );
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(
      view.rows.map((row) => [
        row.houseId,
        {
          previous: numberText(row.previousReading),
          reading: numberText(row.reading)
        }
      ])
    )
  );
  const [charging, setCharging] = useState(false);
  const priceValue = parseMoney(price);
  const priceMissing = priceValue == null;
  const priceError = priceValue != null && (Number.isNaN(priceValue) || priceValue <= 0) ? 'Informe um preço maior que zero.' : null;

  function figures(row: ReadingRow) {
    const entry = draft[row.houseId];
    const previous = row.previousFromHistory ? (row.previousReading == null ? null : Number(row.previousReading)) : parseMoney(entry.previous);
    const reading = parseMoney(entry.reading);
    const used = previous != null && reading != null && !Number.isNaN(previous) && !Number.isNaN(reading) ? reading - previous : null;
    const amount = used != null && used >= 0 && priceValue && !priceError ? Math.round(used * priceValue * 100) / 100 : null;
    return { previous, reading, used, amount };
  }

  const changed = view.rows.some((row) => {
    const entry = draft[row.houseId];
    return (
      row.contributionId == null &&
      (entry.reading !== numberText(row.reading) || (!row.previousFromHistory && entry.previous !== numberText(row.previousReading)))
    );
  });
  const priceChanged = priceValue !== (view.unitPrice == null ? null : Number(view.unitPrice));
  const rowError = view.rows
    .map((row) => ({ row, ...figures(row) }))
    .find(({ row, reading, used }) => row.contributionId == null && reading != null && (Number.isNaN(reading) || (used != null && used < 0)));
  const typed = view.rows.filter((row) => draft[row.houseId].reading.trim() !== '').length;
  const toCharge = view.rows.filter((row) => row.contributionId == null && row.amount != null && Number(row.amount) > 0).length;

  const save = useMutation({
    mutationFn: () =>
      api.saveReadings(
        view.month,
        view.kind,
        priceValue as number,
        view.rows
          .filter((row) => row.contributionId == null)
          .map((row) => ({
            houseId: row.houseId,
            previousReading: row.previousFromHistory ? null : parseMoney(draft[row.houseId].previous),
            reading: parseMoney(draft[row.houseId].reading)
          }))
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['condo', 'readings'] });
      notify('ok', 'Leituras salvas.');
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!priceMissing && !priceError && !rowError) save.mutate();
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-4">
        {save.isError && <FormAlert>{save.error.message}</FormAlert>}
        <Card className="grid gap-5 p-5 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end">
          <Field label="Preço do m³" htmlFor="preco-m3" error={priceError} hint="O da conta da concessionária, dividido como o condomínio combinou.">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
              <Input id="preco-m3" inputMode="decimal" className="pl-9 tabular-nums" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </Field>
          <div className="flex flex-wrap gap-x-8 gap-y-3 sm:justify-end">
            <Total icon={Gauge} label="Leituras lançadas">
              {typed} de {view.rows.length}
            </Total>
            <Total icon={view.kind === 'WATER' ? Droplets : Flame} label="Consumo do mês">
              {cubic(view.totalConsumption)}
            </Total>
            <Total icon={Receipt} label="Valor a cobrar">
              {formatMoney(view.totalAmount)}
            </Total>
          </div>
        </Card>

        {rowError && (
          <FormAlert>
            {rowError.row.houseLabel}: {Number.isNaN(rowError.reading) ? 'informe só números.' : 'a leitura atual é menor que a anterior.'}
          </FormAlert>
        )}

        <Card>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">
                Leituras de {view.kind === 'WATER' ? 'água' : 'gás'} de {monthName(view.month)}
              </caption>
              <thead className="bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Unidade
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Leitura anterior
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Leitura do mês
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Consumo
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Valor
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Situação
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {view.rows.map((row) => {
                  const locked = row.contributionId != null;
                  const { used, amount } = figures(row);
                  return (
                    <tr key={row.houseId} className="transition-colors hover:bg-surface-alt/50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{row.houseLabel}</p>
                        <p className="max-w-48 truncate text-xs text-muted">{row.residentName ?? 'Sem morador'}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        {row.previousFromHistory || locked ? (
                          <span className="tabular-nums" title={row.previousFromHistory ? 'Leitura do mês anterior' : undefined}>
                            {row.previousReading == null ? '—' : numberText(row.previousReading)}
                          </span>
                        ) : (
                          <>
                            <label htmlFor={`anterior-${row.houseId}`} className="sr-only">
                              Leitura anterior de {row.houseLabel}
                            </label>
                            <Input
                              id={`anterior-${row.houseId}`}
                              inputMode="decimal"
                              placeholder="Primeira vez"
                              className="h-9 max-w-32 tabular-nums"
                              value={draft[row.houseId].previous}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  [row.houseId]: {
                                    ...draft[row.houseId],
                                    previous: e.target.value
                                  }
                                })
                              }
                            />
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <label htmlFor={`leitura-${row.houseId}`} className="sr-only">
                          Leitura do mês de {row.houseLabel}
                        </label>
                        <Input
                          id={`leitura-${row.houseId}`}
                          inputMode="decimal"
                          disabled={locked}
                          className="h-9 max-w-32 tabular-nums disabled:opacity-70"
                          value={draft[row.houseId].reading}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              [row.houseId]: {
                                ...draft[row.houseId],
                                reading: e.target.value
                              }
                            })
                          }
                        />
                      </td>
                      <td className={cn('px-4 py-2.5 text-right tabular-nums', used != null && used < 0 && 'text-danger')}>
                        {used == null ? <span className="text-muted">—</span> : cubic(used)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{amount == null ? <span className="text-muted">—</span> : formatMoney(amount)}</td>
                      <td className="px-4 py-2.5">
                        {locked ? (
                          <ChargeBadge status={row.chargeStatus} />
                        ) : row.reading != null ? (
                          <Badge tone="warn">{row.consumption == null ? 'Primeira leitura' : 'Lançada'}</Badge>
                        ) : (
                          <span className="text-xs text-muted">Sem leitura</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {view.rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center text-sm text-muted">
                      Nenhuma unidade cadastrada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-xs text-muted">
            A leitura anterior vem do mês passado. Na primeira vez, informe a do medidor no começo do mês, ou deixe em branco: a leitura fica guardada e o
            consumo conta a partir dela.
          </p>
        </Card>

        <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-2">
          <Button
            type="submit"
            variant={toCharge > 0 && !changed && !priceChanged ? 'secondary' : 'primary'}
            className="shadow-lg"
            disabled={save.isPending || priceMissing || !!priceError || !!rowError}
          >
            {save.isPending ? <Spinner /> : <Save aria-hidden className="size-4" />}
            Salvar leituras
          </Button>
          <Button
            type="button"
            className="shadow-lg"
            disabled={changed || priceChanged || toCharge === 0}
            title={changed || priceChanged ? 'Salve as leituras antes de cobrar.' : undefined}
            onClick={() => setCharging(true)}
          >
            <Send aria-hidden className="size-4" />
            Cobrar {toCharge > 0 ? plural(toCharge, 'unidade', 'unidades') : 'consumo'}
          </Button>
        </div>
      </form>
      {charging && <ChargeDialog view={view} onClose={() => setCharging(false)} />}
    </>
  );
}

/** Water and gas by the meter: each unit's reading of the month, what it used, and the charge of it. */
export function ReadingsPage() {
  const me = useSession();
  const condominium = me.condominium!;
  useDocumentTitle('Água e gás');
  const [month, setMonth] = useState(currentMonth());
  const [kind, setKind] = useState<MeterKind>('WATER');
  const readings = useQuery({
    queryKey: ['condo', 'readings', month, kind],
    queryFn: () => api.readings(month, kind)
  });

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: condominium.name, to: '/condominio' }, { label: 'Água e gás' }]}
        title="Água e gás"
        description="As leituras dos medidores de cada unidade e a cobrança do que cada uma consumiu."
      />

      <div className="flex flex-wrap items-center gap-3">
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
        <Segmented label="Medidor" value={kind} options={kinds} onChange={setKind} />
      </div>

      {readings.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : readings.isError ? (
        <Card role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <AlertTriangle aria-hidden className="size-6 text-danger" />
          <p className="max-w-md text-sm text-muted">{readings.error.message}</p>
          <Button variant="secondary" onClick={() => readings.refetch()}>
            Tentar de novo
          </Button>
        </Card>
      ) : (
        <ReadingsEditor key={`${month}-${kind}-${readings.dataUpdatedAt}`} view={readings.data} />
      )}
    </div>
  );
}
