import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, QrCode, Save, Scale, Settings2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { FormAlert } from '@/components/PublicLayout';
import { Badge, Button, Card, Input, Skeleton, Spinner } from '@/components/ui';
import { Field, PageHeader } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, type CondominiumSettings } from '@/lib/api';
import { useAuth, useSession } from '@/lib/auth';
import { formatMoney, useDocumentTitle } from '@/lib/utils';

/** "1.234,56", "1234.56" or "1234" -> 1234.56; empty -> null. */
function parseMoney(raw: string): number | null {
  const clean = raw.replace(/[^\d,.-]/g, '').trim();
  if (!clean) return null;
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : NaN;
}

function moneyText(value: number | null | undefined) {
  return value == null ? '' : Number(value).toFixed(2).replace('.', ',');
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

  const monthlyValue = parseMoney(monthly);
  const ruleValue = parseMoney(rule);
  const errors = {
    name: name.trim().length < 3 ? 'Pelo menos 3 letras.' : null,
    monthly: monthlyValue == null || Number.isNaN(monthlyValue) || monthlyValue <= 0 ? 'Informe um valor maior que zero.' : null,
    rule: ruleValue !== null && (Number.isNaN(ruleValue) || ruleValue < 0) ? 'Informe um valor, ou deixe em branco.' : null
  };
  const valid = !errors.name && !errors.monthly && !errors.rule;

  const save = useMutation({
    mutationFn: async () => {
      await api.updateSettings({ villageName: name.trim(), monthlyAmount: monthlyValue as number, paymentDueDay: Number(dueDay) });
      if ((ruleValue ?? null) !== (settings.budgetRequiredAbove ?? null)) await api.updateBudgetRule(ruleValue);
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

      <Section icon={QrCode} title="Mensalidade" description="O valor que cada unidade paga por mês e o dia em que vence.">
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

      <Section icon={QrCode} title="Pagamentos por Pix" description="Por onde as mensalidades são cobradas e recebidas.">
        {condominium.pixConnected ? (
          <div className="flex items-start gap-3 rounded-xl border border-ok/25 bg-ok-soft p-4 text-sm text-ok">
            <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong className="font-semibold">Conta Asaas conectada.</strong> As cobranças por Pix e os avisos de pagamento já funcionam.
            </p>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-line bg-surface-alt/60 p-4 text-sm">
            <Badge>Não conectado</Badge>
            <p className="text-muted">
              O dinheiro do condomínio fica na conta Asaas do próprio condomínio. A conexão por aqui (colar a chave da conta, que fica guardada cifrada)
              chega na próxima etapa do painel. Até lá, o condomínio usa tudo menos o Pix.
            </p>
          </div>
        )}
      </Section>
    </div>
  );
}
