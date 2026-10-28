import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BellRing, Landmark, QrCode, Save, Scale, Settings2 } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { PixConnection } from '@/components/PixConnection';
import { FormAlert } from '@/components/PublicLayout';
import { Button, Card, Input, Skeleton, Spinner } from '@/components/ui';
import { Field, PageHeader, Segmented } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, type BillingType, type CondominiumSettings } from '@/lib/api';
import { useAuth, useSession } from '@/lib/auth';
import { cn, currentMonth, formatMoney, moneyText, parseMoney, useDocumentTitle } from '@/lib/utils';

const billingTypes: { value: BillingType; label: string }[] = [
  { value: 'PIX', label: 'Pix' },
  { value: 'BOLETO', label: 'Boleto com Pix' }
];

/** A percentage field: "2", "2,5" or "1.5" -> number; empty -> 0. */
function parsePercent(raw: string) {
  const value = parseMoney(raw);
  return value == null ? 0 : value;
}

function Toggle({ labelledBy, checked, onChange }: { labelledBy: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        checked ? 'bg-brand' : 'bg-line-strong/50'
      )}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

function PercentInput({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Input id={id} inputMode="decimal" className="pr-9 tabular-nums" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
    </div>
  );
}

function Section({ icon: Icon, title, description, children }: { icon: typeof Settings2; title: string; description: string; children: ReactNode }) {
  return (
    <Card className="grid gap-6 p-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <div>
        <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
          <Icon aria-hidden className="size-4" />
        </span>
        <h2 className="mt-3 text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function SettingsForm({ settings }: { settings: CondominiumSettings }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const { refresh } = useAuth();
  const [name, setName] = useState(settings.villageName);
  const [monthly, setMonthly] = useState(moneyText(settings.monthlyAmount));
  const [dueDay, setDueDay] = useState(String(settings.paymentDueDay));
  const [rule, setRule] = useState(moneyText(settings.budgetRequiredAbove));
  const [billingType, setBillingType] = useState<BillingType>(settings.billingType ?? 'PIX');
  const [fine, setFine] = useState(moneyText(settings.finePercent ?? 0));
  const [interest, setInterest] = useState(moneyText(settings.interestPercent ?? 0));
  const [title, setTitle] = useState(settings.chargeTitle ?? 'Taxa condominial');
  const [reserve, setReserve] = useState(moneyText(settings.reserveFundPercent ?? 0));
  const [reminders, setReminders] = useState(settings.remindersEnabled ?? false);
  const [daysBefore, setDaysBefore] = useState(String(settings.reminderDaysBefore ?? 3));

  const monthlyValue = parseMoney(monthly);
  const ruleValue = parseMoney(rule);
  const fineValue = parsePercent(fine);
  const interestValue = parsePercent(interest);
  const reserveValue = parsePercent(reserve);
  const errors = {
    name: name.trim().length < 3 ? 'Pelo menos 3 letras.' : null,
    monthly: monthlyValue == null || Number.isNaN(monthlyValue) || monthlyValue <= 0 ? 'Informe um valor maior que zero.' : null,
    rule: ruleValue !== null && (Number.isNaN(ruleValue) || ruleValue < 0) ? 'Informe um valor, ou deixe em branco.' : null,
    fine: Number.isNaN(fineValue) || fineValue < 0 || fineValue > 2 ? 'De 0% a 2%: o máximo que a lei permite ao condomínio.' : null,
    interest: Number.isNaN(interestValue) || interestValue < 0 || interestValue > 10 ? 'De 0% a 10% ao mês.' : null,
    title: title.trim().length < 3 || title.trim().length > 60 ? 'De 3 a 60 letras.' : null,
    reserve: Number.isNaN(reserveValue) || reserveValue < 0 || reserveValue > 30 ? 'De 0% a 30% da taxa.' : null
  };
  const valid = Object.values(errors).every((error) => !error);
  const billingChanged =
    billingType !== settings.billingType ||
    fineValue !== Number(settings.finePercent) ||
    interestValue !== Number(settings.interestPercent) ||
    title.trim() !== settings.chargeTitle ||
    reserveValue !== Number(settings.reserveFundPercent) ||
    reminders !== settings.remindersEnabled ||
    Number(daysBefore) !== settings.reminderDaysBefore;

  const save = useMutation({
    mutationFn: async () => {
      await api.updateSettings({ villageName: name.trim(), monthlyAmount: monthlyValue as number, paymentDueDay: Number(dueDay) });
      if ((ruleValue ?? null) !== (settings.budgetRequiredAbove ?? null)) await api.updateBudgetRule(ruleValue);
      if (billingChanged)
        await api.updateBillingRules({
          billingType,
          finePercent: fineValue,
          interestPercent: interestValue,
          chargeTitle: title.trim(),
          reserveFundPercent: reserveValue,
          remindersEnabled: reminders,
          reminderDaysBefore: Number(daysBefore)
        });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['condo'] });
      refresh();
      notify('ok', 'Configurações salvas.');
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) save.mutate();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {save.isError && <FormAlert>{save.error.message}</FormAlert>}

      <Section icon={Settings2} title="Condomínio" description="Como ele aparece no aplicativo, no painel e nas mensagens.">
        <Field label="Nome" htmlFor="nome" error={errors.name}>
          <Input id="nome" maxLength={140} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </Section>

      <Section icon={QrCode} title="Cobrança" description="O valor de cada unidade, quando vence, como paga e o que acontece com o atraso.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor por unidade" htmlFor="valor" error={errors.monthly} hint={monthlyValue && !errors.monthly ? formatMoney(monthlyValue) : undefined}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
              <Input id="valor" inputMode="decimal" className="pl-9 tabular-nums" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            </div>
          </Field>
          <Field label="Dia do vencimento" htmlFor="vencimento" hint="De 1 a 28, para valer em todos os meses.">
            <select
              id="vencimento"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              className="h-10 w-full rounded-lg border border-line-strong/60 bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
            >
              {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  Dia {day}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="space-y-1.5">
          <p id="forma-label" className="text-sm font-medium text-ink">
            Forma de pagamento
          </p>
          <Segmented label="Forma de pagamento" value={billingType} options={billingTypes} onChange={setBillingType} />
          <p className="text-xs text-muted">
            {billingType === 'PIX'
              ? 'Só Pix: o mais barato no Asaas e o dinheiro cai na hora.'
              : 'Boleto com o QR Code do Pix impresso nele: a unidade paga como preferir. O boleto tem tarifa maior no Asaas.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Multa por atraso" htmlFor="multa" error={errors.fine} hint="Até 2%, pelo Código Civil (art. 1.336). Use o da convenção.">
            <PercentInput id="multa" value={fine} onChange={setFine} />
          </Field>
          <Field label="Juros por mês de atraso" htmlFor="juros" error={errors.interest} hint="Os da convenção; se ela não disser, os da lei.">
            <PercentInput id="juros" value={interest} onChange={setInterest} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
          <Field
            label="Fundo de reserva"
            htmlFor="fundo"
            error={errors.reserve}
            hint={
              reserveValue > 0 && monthlyValue && !errors.monthly && !errors.reserve
                ? `+ ${formatMoney((monthlyValue * reserveValue) / 100)} por unidade`
                : 'Somado à taxa. Zero: sem fundo.'
            }
          >
            <PercentInput id="fundo" value={reserve} onChange={setReserve} />
          </Field>
          <Field
            label="Nome da cobrança"
            htmlFor="nome-cobranca"
            error={errors.title}
            hint={`Aparece na fatura: “${title.trim() || 'Taxa condominial'}${reserveValue > 0 ? ' + fundo de reserva' : ''} - Casa 1 - ${currentMonth()}”.`}
          >
            <Input id="nome-cobranca" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>
        <p className="rounded-lg bg-surface-alt/70 px-3 py-2 text-xs text-muted">
          Forma, multa, juros, fundo e nome valem para as cobranças geradas daqui em diante. As que já foram emitidas continuam como estão.
        </p>
      </Section>

      <Section icon={BellRing} title="Lembretes" description="Avisos no celular dos moradores, pelo aplicativo, enquanto a cobrança não é paga.">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p id="lembretes-label" className="text-sm font-medium text-ink">
              Lembrar os moradores das cobranças
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Às 9h: antes do vencimento, no dia e no dia seguinte, se ainda não foi paga. Chegam para quem ativou as notificações do aplicativo.
            </p>
          </div>
          <Toggle labelledBy="lembretes-label" checked={reminders} onChange={setReminders} />
        </div>
        <Field label="Primeiro lembrete" htmlFor="dias-antes" className="max-w-60">
          <select
            id="dias-antes"
            value={daysBefore}
            disabled={!reminders}
            onChange={(e) => setDaysBefore(e.target.value)}
            className="h-10 w-full rounded-lg border border-line-strong/60 bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-60"
          >
            {Array.from({ length: 10 }, (_, index) => index + 1).map((days) => (
              <option key={days} value={days}>
                {days === 1 ? '1 dia antes' : `${days} dias antes`}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section icon={Scale} title="Orçamento e votação" description="Gastos grandes só acontecem depois de um orçamento aprovado pelas unidades.">
        <Field
          label="Precisa de orçamento e votação acima de"
          htmlFor="regra"
          error={errors.rule}
          hint={ruleValue ? `Gastos acima de ${formatMoney(ruleValue)} passam por orçamento e votação.` : 'Em branco: nenhum gasto exige orçamento.'}
        >
          <div className="relative max-w-60">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
            <Input id="regra" inputMode="decimal" className="pl-9 tabular-nums" placeholder="300,00" value={rule} onChange={(e) => setRule(e.target.value)} />
          </div>
        </Field>
      </Section>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button type="submit" disabled={save.isPending || !valid} className="shadow-lg">
          {save.isPending ? <Spinner /> : <Save aria-hidden className="size-4" />}
          Salvar configurações
        </Button>
      </div>
    </form>
  );
}

export function CondoSettingsPage() {
  const me = useSession();
  const condominium = me.condominium!;
  useDocumentTitle('Configurações');
  const settings = useQuery({ queryKey: ['condo', 'settings'], queryFn: api.settings });
  const payments = useQuery({ queryKey: ['condo', 'payments'], queryFn: api.paymentsStatus });
  const { hash } = useLocation();
  const loaded = !settings.isPending && !payments.isPending;

  // "Fazer" on the overview opens the Pix section directly. It sits below the form: scroll once both have their real height.
  useEffect(() => {
    if (hash === '#pix' && loaded) document.getElementById('pix')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, loaded]);

  return (
    <div className="space-y-6">
      <PageHeader crumbs={[{ label: condominium.name, to: '/condominio' }, { label: 'Configurações' }]} title="Configurações" description="O que vale para todo o condomínio." />

      {settings.isPending ? (
        <div className="space-y-4">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : settings.isError ? (
        <Card role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <AlertTriangle aria-hidden className="size-6 text-danger" />
          <p className="max-w-md text-sm text-muted">{settings.error.message}</p>
          <Button variant="secondary" onClick={() => settings.refetch()}>
            Tentar de novo
          </Button>
        </Card>
      ) : (
        <SettingsForm key={settings.data.id} settings={settings.data} />
      )}

      <div id="pix" className="scroll-mt-20">
        <Section icon={Landmark} title="Pagamentos por Pix" description="A conta Asaas do condomínio, onde as mensalidades são cobradas e recebidas.">
          <PixConnection />
        </Section>
      </div>
    </div>
  );
}
