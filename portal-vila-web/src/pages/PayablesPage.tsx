import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  FileText,
  HandCoins,
  Hourglass,
  Info,
  Plus,
  Receipt,
  Repeat,
  Search,
  ShieldCheck,
  Wallet
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { isoToday } from '@/components/ChargeResultDialog';
import { FileField, MoneyInput, selectClass, Textarea } from '@/components/forms';
import { FormAlert } from '@/components/PublicLayout';
import { Badge, Button, Card, Input, Skeleton, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { Field, PageHeader, Segmented } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, type Budget, type ExpenseRecord, type Payable, type PaymentMethod, type ServiceOrder } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { paymentTermsText } from '@/lib/paymentTerms';
import { cn, formatDate, formatMoney, moneyText, parseMoney, plural, useDocumentTitle } from '@/lib/utils';
import { SupplierDialog } from '@/pages/SuppliersPage';

type Filter = 'open' | 'approval' | 'paid' | 'cancelled' | 'all';

const filters: { value: Filter; label: string }[] = [
  { value: 'open', label: 'A pagar' },
  { value: 'approval', label: 'Aguardando aprovação' },
  { value: 'paid', label: 'Pagas' },
  { value: 'cancelled', label: 'Canceladas' },
  { value: 'all', label: 'Todas' }
];

const matches: Record<Filter, (payable: Payable) => boolean> = {
  open: (payable) => payable.status === 'APPROVED' || payable.status === 'PENDING_APPROVAL',
  approval: (payable) => payable.status === 'PENDING_APPROVAL',
  paid: (payable) => payable.status === 'PAID',
  cancelled: (payable) => payable.status === 'CANCELLED',
  all: () => true
};

export const categories = ['Manutenção', 'Limpeza', 'Pessoal', 'Energia', 'Água', 'Gás', 'Taxas', 'Seguro', 'Administração', 'Obras', 'Outros'];

export const methods: { value: PaymentMethod; label: string }[] = [
  { value: 'PIX', label: 'Pix' },
  { value: 'TED', label: 'TED / transferência' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'CARTAO', label: 'Cartão' },
  { value: 'OUTRO', label: 'Outro' }
];

function StatusBadge({ payable }: { payable: Payable }) {
  if (payable.status === 'PAID') return <Badge tone="ok">Paga</Badge>;
  if (payable.status === 'CANCELLED') return <Badge>Cancelada</Badge>;
  if (payable.status === 'PENDING_APPROVAL') return <Badge tone="warn">Aguardando aprovação</Badge>;
  return payable.overdue ? <Badge tone="danger">Vencida</Badge> : <Badge tone="brand">A pagar</Badge>;
}

function Kpi({ icon: Icon, label, value, detail, tone }: { icon: typeof Wallet; label: string; value: ReactNode; detail: ReactNode; tone: 'brand' | 'ok' | 'warn' | 'danger' }) {
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

type Repetition = 'once' | 'installments' | 'down' | 'monthly';

function addMonths(iso: string, months: number) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1 + months, day);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * What a service has already taken: its bills not cancelled, and expenses booked without a bill (finishing it). The
 * cap is what the units approved plus 10%; with no budget, the limit without a vote.
 */
export function serviceSpending(service: ServiceOrder, bills: Payable[], spent: ExpenseRecord[], budget: Budget | null, limit: number | null) {
  const own = bills.filter((bill) => bill.serviceOrderId === service.id && bill.status !== 'CANCELLED');
  const billed = new Set(own.map((bill) => bill.expenseId).filter(Boolean));
  const loose = spent.filter((expense) => expense.serviceOrderId === service.id && !billed.has(expense.id));
  const paid = own.filter((bill) => bill.status === 'PAID').reduce((sum, bill) => sum + Number(bill.amount), 0) + loose.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const committed = own.reduce((sum, bill) => sum + Number(bill.amount), 0) + loose.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const cap = budget ? Math.round(Number(budget.amount) * 110) / 100 : limit;
  return { bills: own, paid, committed, cap };
}

/** " (entrada de R$ 1.800,00 + restante em 2× ...)": how the units approved paying, inside a sentence. */
function termsNote(budget: Budget) {
  const text = paymentTermsText(budget);
  return text ? ` (${text.charAt(0).toLocaleLowerCase('pt-BR')}${text.slice(1)})` : '';
}

/**
 * A new bill: what, to whom, how much, when; at once, in installments, a down payment and the rest, or every month;
 * with the invoice or boleto. For a service it starts from what the units approved and how the supplier is paid.
 */
export function NewPayableDialog({ onClose, service: forService }: { onClose: () => void; service?: ServiceOrder }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const suppliers = useQuery({ queryKey: ['condo', 'suppliers'], queryFn: api.suppliers });
  const services = useQuery({ queryKey: ['condo', 'services'], queryFn: api.services });
  const budgets = useQuery({ queryKey: ['condo', 'demand-budgets'], queryFn: api.fullBudgets });
  const bills = useQuery({ queryKey: ['condo', 'payables'], queryFn: api.payables });
  const spent = useQuery({ queryKey: ['condo', 'expenses'], queryFn: api.expenses });
  const settings = useQuery({ queryKey: ['condo', 'settings'], queryFn: api.settings });
  const [description, setDescription] = useState('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [category, setCategory] = useState('Manutenção');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(isoToday());
  const [repetition, setRepetition] = useState<Repetition>('once');
  const [installments, setInstallments] = useState('2');
  const [downPayment, setDownPayment] = useState('');
  const [restDueDate, setRestDueDate] = useState(addMonths(isoToday(), 1));
  const [serviceId, setServiceId] = useState(forService ? String(forService.id) : '');
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [newSupplier, setNewSupplier] = useState(false);
  const [prefilled, setPrefilled] = useState<string | null>(null);

  const openServices = (services.data ?? []).filter((item) => item.status !== 'CANCELADO');
  const service = openServices.find((item) => String(item.id) === serviceId) ?? null;
  const budget = service?.approvedBudgetId ? ((budgets.data ?? []).find((item) => item.id === service.approvedBudgetId) ?? null) : null;
  const spending = service ? serviceSpending(service, bills.data ?? [], spent.data ?? [], budget, settings.data?.budgetRequiredAbove ?? null) : null;

  // Once the service and what it already took are known, start from what is left and how the units approved paying it.
  const ready = service != null && bills.isSuccess && spent.isSuccess && budgets.isSuccess && suppliers.isSuccess;
  useEffect(() => {
    if (!ready || !service || !spending || prefilled === serviceId) return;
    setPrefilled(serviceId);
    const left = Math.max(0, Number(service.expectedValue ?? budget?.amount ?? 0) - spending.committed);
    setDescription((current) => current || service.title);
    if (left > 0) setAmount(moneyText(left));
    const match = (suppliers.data ?? []).find(
      (supplier) =>
        supplier.active &&
        ((service.supplierDocument && supplier.document === service.supplierDocument) || supplier.name.trim().toLocaleLowerCase('pt-BR') === service.supplier?.trim().toLocaleLowerCase('pt-BR'))
    );
    if (match) setSupplierId(String(match.id));
    // The way of paying the units voted applies to the whole job, so only while nothing was billed yet.
    if (spending.committed === 0 && budget?.paymentMode === 'ENTRADA') {
      setRepetition('down');
      setDownPayment(moneyText(budget.downPayment));
      setInstallments(String(budget.paymentInstallments ?? 1));
    } else if (spending.committed === 0 && budget?.paymentMode === 'PARCELADO') {
      setRepetition('installments');
      setInstallments(String(budget.paymentInstallments ?? 2));
    } else {
      setRepetition('once');
    }
  }, [ready, service, spending, budget, suppliers.data, prefilled, serviceId]);

  const value = parseMoney(amount);
  const down = repetition === 'down' ? parseMoney(downPayment) : null;
  const parts = repetition === 'installments' || repetition === 'down' ? Number(installments || (repetition === 'down' ? '1' : '0')) : 1;
  const errors = {
    description: description.trim().length < 3 ? 'Descreva a conta.' : null,
    amount: value == null || Number.isNaN(value) || value <= 0 ? 'Informe um valor maior que zero.' : null,
    dueDate: !dueDate ? 'Informe o vencimento.' : null,
    installments:
      repetition === 'installments' && (!Number.isInteger(parts) || parts < 2 || parts > 60)
        ? 'De 2 a 60 parcelas.'
        : repetition === 'down' && (!Number.isInteger(parts) || parts < 1 || parts > 60)
          ? 'De 1 a 60 parcelas.'
          : null,
    downPayment:
      repetition === 'down' && (down == null || Number.isNaN(down) || down <= 0 || (value != null && down >= value)) ? 'A entrada precisa ser menor que o total.' : null,
    restDueDate: repetition === 'down' && (!restDueDate || restDueDate < dueDate) ? 'O restante vence depois da entrada.' : null
  };
  const valid = Object.values(errors).every((error) => !error);

  const create = useMutation({
    mutationFn: async () => {
      const document = file ? await api.uploadDocument(file, 'NOTA_FISCAL') : null;
      return api.createPayable({
        supplierId: supplierId ? Number(supplierId) : null,
        description: description.trim(),
        category,
        amount: value as number,
        dueDate,
        installments: parts,
        monthly: repetition === 'monthly',
        budgetId: null,
        serviceOrderId: service ? service.id : null,
        downPayment: repetition === 'down' ? down : null,
        restDueDate: repetition === 'down' ? restDueDate : null,
        documentId: document?.id ?? null,
        exceptionReason: reason.trim() || null,
        notes: notes.trim() || null
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['condo', 'payables'] });
      queryClient.invalidateQueries({ queryKey: ['condo', 'services'] });
      notify(
        'ok',
        created[0]?.status === 'PENDING_APPROVAL'
          ? created.length > 1
            ? `${created.length} contas lançadas. Elas esperam a aprovação de outra pessoa.`
            : 'Conta lançada. Ela espera a aprovação de outra pessoa.'
          : repetition === 'down'
            ? `Entrada e restante lançados (${created.length} contas).`
            : created.length > 1
              ? `${created.length} parcelas lançadas.`
              : 'Conta lançada.'
      );
      onClose();
    }
  });
  const askReason = create.isError && /justificativa/i.test(create.error.message);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) create.mutate();
  }

  if (newSupplier) {
    return (
      <SupplierDialog
        supplier={null}
        onClose={() => setNewSupplier(false)}
        onSaved={(saved) => {
          setSupplierId(String(saved.id));
          setNewSupplier(false);
        }}
      />
    );
  }

  return (
    <Dialog
      open
      onClose={() => !create.isPending && onClose()}
      icon={<HandCoins aria-hidden className="size-5" />}
      title="Nova conta a pagar"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="nova-conta" disabled={create.isPending || !valid}>
            {create.isPending && <Spinner />}
            Lançar conta
          </Button>
        </>
      }
    >
      <form id="nova-conta" onSubmit={submit} noValidate className="space-y-4">
        {create.isError && <FormAlert>{create.error.message}</FormAlert>}
        <Field
          label="Serviço"
          htmlFor="conta-servico"
          hint={
            spending && service
              ? [
                  budget ? `Aprovado pelas unidades: ${formatMoney(budget.amount)}${termsNote(budget)}.` : null,
                  spending.committed > 0 ? `Já lançado para ele: ${formatMoney(spending.committed)}, ${formatMoney(spending.paid)} pago.` : null,
                  spending.cap != null ? `Sem justificativa, vai até ${formatMoney(spending.cap)} no total.` : null
                ]
                  .filter(Boolean)
                  .join(' ')
              : 'Se a conta é de um serviço, escolha-o: o que foi votado e o que já foi pago entram na conta.'
          }
        >
          <select
            id="conta-servico"
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setPrefilled(null);
            }}
            className={selectClass}
          >
            <option value="">Nenhum</option>
            {openServices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {item.supplier ? ` · ${item.supplier}` : ''}
                {item.expectedValue != null ? ` · ${formatMoney(item.expectedValue)}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="O que é" htmlFor="conta-descricao" error={description && errors.description ? errors.description : null}>
          <Input id="conta-descricao" data-autofocus maxLength={200} placeholder="Limpeza da caixa d'água" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fornecedor" htmlFor="conta-fornecedor" hint={<button type="button" className="font-medium text-brand hover:underline" onClick={() => setNewSupplier(true)}>Cadastrar outro fornecedor</button>}>
            <select id="conta-fornecedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
              <option value="">Sem fornecedor</option>
              {(suppliers.data ?? [])
                .filter((supplier) => supplier.active)
                .map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Categoria" htmlFor="conta-categoria">
            <select id="conta-categoria" value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
              {categories.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={repetition === 'once' || repetition === 'monthly' ? 'Valor' : 'Valor total'} htmlFor="conta-valor" error={amount && errors.amount ? errors.amount : null}>
            <MoneyInput id="conta-valor" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field
            label={repetition === 'installments' ? 'Vencimento da 1ª parcela' : repetition === 'down' ? 'Vencimento da entrada' : 'Vencimento'}
            htmlFor="conta-vencimento"
            error={errors.dueDate}
          >
            <Input id="conta-vencimento" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Como vai pagar</p>
          <Segmented
            label="Como vai pagar"
            value={repetition}
            onChange={setRepetition}
            options={[
              { value: 'once', label: 'De uma vez' },
              { value: 'installments', label: 'Parcelado' },
              { value: 'down', label: 'Entrada + restante' },
              { value: 'monthly', label: 'Todo mês' }
            ]}
          />
          {repetition === 'monthly' && <p className="text-xs text-muted">Ao pagar, a do mês seguinte já aparece, aprovada. Para parar, cancele a próxima.</p>}
        </div>
        {repetition === 'installments' && (
          <Field
            label="Parcelas"
            htmlFor="conta-parcelas"
            error={errors.installments}
            hint={value && !errors.amount && !errors.installments ? `${parts} × ${formatMoney(Math.floor((value / parts) * 100) / 100)}, uma por mês` : undefined}
          >
            <Input id="conta-parcelas" type="number" min={2} max={60} className="max-w-28" value={installments} onChange={(e) => setInstallments(e.target.value)} />
          </Field>
        )}
        {repetition === 'down' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Entrada" htmlFor="conta-entrada" error={downPayment ? errors.downPayment : null}>
              <MoneyInput id="conta-entrada" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} />
            </Field>
            <Field
              label="Restante em"
              htmlFor="conta-parcelas"
              error={errors.installments}
              hint={
                value && down && !errors.downPayment && !errors.installments
                  ? `${parts === 1 ? '' : `${parts} × `}${formatMoney(Math.floor(((value - down) / parts) * 100) / 100)}`
                  : 'vezes'
              }
            >
              <Input id="conta-parcelas" type="number" min={1} max={60} value={installments} onChange={(e) => setInstallments(e.target.value)} />
            </Field>
            <Field label="Restante vence em" htmlFor="conta-restante" error={errors.restDueDate}>
              <Input id="conta-restante" type="date" min={dueDate} value={restDueDate} onChange={(e) => setRestDueDate(e.target.value)} />
            </Field>
          </div>
        )}
        <FileField id="conta-arquivo" label="Nota fiscal ou boleto" hint="Opcional. Foto ou PDF." file={file} onChange={setFile} />
        {askReason && (
          <Field label="Justificativa de emergência" htmlFor="conta-justificativa" hint="Pelo menos 20 letras. Aparece para todas as unidades, como nas despesas.">
            <Textarea id="conta-justificativa" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        )}
        <Field label="Observações" htmlFor="conta-obs">
          <Input id="conta-obs" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/** A payment made outside the system: when, how, and the receipt. The bill becomes an expense of the cash box. */
export function PayDialog({ payable, onClose }: { payable: Payable; onClose: () => void }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const today = isoToday();
  const [paidAt, setPaidAt] = useState(today);
  const [method, setMethod] = useState<PaymentMethod>('PIX');
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const dateError = !paidAt || paidAt > today ? 'Escolha hoje ou um dia que já passou.' : null;

  const pay = useMutation({
    mutationFn: async () => {
      const receipt = file ? await api.uploadDocument(file, 'RECIBO') : null;
      return api.payPayable(payable.id, { paidAt, method, receiptDocumentId: receipt?.id ?? null, notes: notes.trim() || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['condo'] });
      notify('ok', `${payable.description}: pagamento registrado e lançado nas despesas.`);
      onClose();
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!dateError) pay.mutate();
  }

  return (
    <Dialog
      open
      onClose={() => !pay.isPending && onClose()}
      tone="ok"
      icon={<CheckCircle2 aria-hidden className="size-5" />}
      title="Registrar pagamento"
      description={`${payable.description}${payable.supplierName ? ` · ${payable.supplierName}` : ''} · ${formatMoney(payable.amount)}. Para o que já foi pago no banco ou em dinheiro: vira despesa no caixa, com o comprovante.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pay.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="registrar-pagamento" disabled={pay.isPending || !!dateError}>
            {pay.isPending && <Spinner />}
            Registrar pagamento
          </Button>
        </>
      }
    >
      <form id="registrar-pagamento" onSubmit={submit} noValidate className="space-y-4">
        {pay.isError && <FormAlert>{pay.error.message}</FormAlert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pago em" htmlFor="pago-em" error={dateError}>
            <Input id="pago-em" data-autofocus type="date" max={today} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
          <Field label="Como foi pago" htmlFor="pago-como">
            <select id="pago-como" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={selectClass}>
              {methods.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <FileField id="pago-comprovante" label="Comprovante" hint="Foto ou PDF. Fica na prestação de contas, para as unidades verem." file={file} onChange={setFile} />
        <Field label="Observação" htmlFor="pago-obs">
          <Input id="pago-obs" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

function CancelDialog({ payable, onClose }: { payable: Payable; onClose: () => void }) {
  const queryClient = useQueryClient();
  const notify = useToast();
  const [reason, setReason] = useState('');
  const cancel = useMutation({
    mutationFn: () => api.cancelPayable(payable.id, reason.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['condo', 'payables'] });
      notify('ok', 'Conta cancelada.');
      onClose();
    }
  });
  return (
    <Dialog
      open
      onClose={() => !cancel.isPending && onClose()}
      tone="danger"
      size="sm"
      icon={<Ban aria-hidden className="size-5" />}
      title="Cancelar esta conta?"
      description={`${payable.description} · ${formatMoney(payable.amount)}${payable.recurrence ? '. Ela deixa de se repetir.' : '.'} O motivo fica na auditoria.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={cancel.isPending}>
            Voltar
          </Button>
          <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending || reason.trim().length < 3}>
            {cancel.isPending && <Spinner />}
            Cancelar conta
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {cancel.isError && <FormAlert>{cancel.error.message}</FormAlert>}
        <Field label="Motivo" htmlFor="motivo-conta">
          <Input id="motivo-conta" data-autofocus maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

function Trail({ payable }: { payable: Payable }) {
  const parts = [
    payable.createdBy && `lançada por ${payable.createdBy}`,
    payable.approvedBy && payable.approvedBy !== payable.createdBy && `aprovada por ${payable.approvedBy}`,
    payable.paidBy && `paga por ${payable.paidBy}`,
    payable.cancelledBy && `cancelada por ${payable.cancelledBy}${payable.cancelReason ? `: ${payable.cancelReason}` : ''}`
  ].filter(Boolean);
  return parts.length > 0 ? <p className="text-xs text-muted first-letter:uppercase">{parts.join(' · ')}</p> : null;
}

/** The condominium's bills: what is due, what waits for approval, and what was paid, with who did each step. */
export function PayablesPage() {
  const me = useSession();
  const condominium = me.condominium!;
  useDocumentTitle('Contas a pagar');
  const queryClient = useQueryClient();
  const notify = useToast();
  const payables = useQuery({ queryKey: ['condo', 'payables'], queryFn: api.payables });
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [paying, setPaying] = useState<Payable | null>(null);
  const [cancelling, setCancelling] = useState<Payable | null>(null);

  const approve = useMutation({
    mutationFn: api.approvePayable,
    onSuccess: (payable) => {
      queryClient.invalidateQueries({ queryKey: ['condo', 'payables'] });
      notify('ok', `${payable.description}: aprovada.`);
    },
    onError: (error) => notify('danger', error.message)
  });
  const openDocument = (id: number) => api.openDocument(id).catch((error: Error) => notify('danger', error.message));

  const all = payables.data ?? [];
  const today = isoToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const limit30 = `${in30.getFullYear()}-${String(in30.getMonth() + 1).padStart(2, '0')}-${String(in30.getDate()).padStart(2, '0')}`;
  const open = all.filter(matches.open);
  const sum = (items: Payable[]) => items.reduce((total, item) => total + Number(item.amount), 0);
  const overdue = open.filter((payable) => payable.overdue);
  const upcoming = open.filter((payable) => !payable.overdue && payable.dueDate <= limit30);
  const waiting = all.filter(matches.approval);
  const paidThisMonth = all.filter((payable) => payable.status === 'PAID' && payable.paidAt != null && payable.paidAt >= monthStart);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    const rows = all
      .filter(matches[filter])
      .filter(
        (payable) =>
          !term || payable.description.toLocaleLowerCase('pt-BR').includes(term) || (payable.supplierName ?? '').toLocaleLowerCase('pt-BR').includes(term)
      );
    // Paid and cancelled ones: the latest first. Open ones: the most urgent first.
    return filter === 'paid' || filter === 'cancelled' ? [...rows].reverse() : rows;
  }, [all, filter, search]);

  const loading = payables.isPending;
  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: condominium.name, to: me.role === 'ADMIN' ? '/condominio' : '/condominio/contas' }, { label: 'Contas a pagar' }]}
        title="Contas a pagar"
        description="O que o condomínio deve pagar, quem aprovou e o que já foi pago, com os comprovantes."
        actions={
          me.canPay && (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden className="size-4" />
              Nova conta
            </Button>
          )
        }
      />

      {!me.canPay && (
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-alt/60 p-4 text-sm text-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
          <p>Você acompanha as contas do condomínio. Para lançar, aprovar e pagar, a administração precisa liberar em Configurações → Contas a pagar.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi icon={CalendarClock} tone="brand" label="A vencer em 30 dias" value={loading ? <Skeleton className="h-7 w-28" /> : formatMoney(sum(upcoming))} detail={loading ? '…' : plural(upcoming.length, 'conta', 'contas')} />
        <Kpi icon={AlertTriangle} tone="danger" label="Vencidas" value={loading ? <Skeleton className="h-7 w-28" /> : formatMoney(sum(overdue))} detail={loading ? '…' : plural(overdue.length, 'conta', 'contas')} />
        <Kpi icon={Hourglass} tone="warn" label="Aguardando aprovação" value={loading ? <Skeleton className="h-7 w-28" /> : formatMoney(sum(waiting))} detail={loading ? '…' : plural(waiting.length, 'conta', 'contas')} />
        <Kpi icon={Wallet} tone="ok" label="Pagas no mês" value={loading ? <Skeleton className="h-7 w-28" /> : formatMoney(sum(paidThisMonth))} detail={loading ? '…' : plural(paidThisMonth.length, 'conta', 'contas')} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <label htmlFor="busca-conta" className="sr-only">
              Buscar conta ou fornecedor
            </label>
            <Input id="busca-conta" type="search" placeholder="Buscar conta ou fornecedor" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Segmented label="Mostrar" value={filter} options={filters} onChange={setFilter} />
        </div>

        {payables.isError ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <AlertTriangle aria-hidden className="size-6 text-danger" />
            <p className="max-w-md text-sm text-muted">{payables.error.message}</p>
            <Button variant="secondary" onClick={() => payables.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">Contas a pagar do condomínio</caption>
              <thead className="bg-surface-alt/60 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Vencimento</th>
                  <th scope="col" className="px-4 py-3 font-medium">Conta</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Valor</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading &&
                  [0, 1, 2].map((index) => (
                    <tr key={index}>
                      {[0, 1, 2, 3, 4].map((cell) => (
                        <td key={cell} className="px-4 py-4">
                          <Skeleton className="h-4 w-full max-w-32" />
                        </td>
                      ))}
                    </tr>
                  ))}
                {!loading &&
                  visible.map((payable) => {
                    const isOpen = payable.status === 'APPROVED' || payable.status === 'PENDING_APPROVAL';
                    return (
                      <tr key={payable.id} className="align-top transition-colors hover:bg-surface-alt/50">
                        <td className={cn('px-4 py-3.5 tabular-nums', payable.overdue && 'font-medium text-danger')}>
                          {formatDate(payable.status === 'PAID' ? payable.paidAt : payable.dueDate)}
                          {payable.status === 'PAID' && <p className="text-xs font-normal text-muted">venceu {formatDate(payable.dueDate)}</p>}
                        </td>
                        <td className="max-w-md px-4 py-3.5">
                          <p className="font-medium">
                            {payable.description}
                            {payable.installments && (
                              <Badge className="ml-2" tone="neutral">
                                {payable.installment}/{payable.installments}
                              </Badge>
                            )}
                            {payable.recurrence && (
                              <Badge className="ml-2" tone="neutral">
                                <Repeat aria-hidden className="size-3" /> Todo mês
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted">
                            {[payable.supplierName, payable.category].filter(Boolean).join(' · ') || 'Sem fornecedor'}
                            {payable.serviceOrderId && (
                              <>
                                {' · '}
                                <Link to={`/condominio/servicos/${payable.serviceOrderId}`} className="font-medium text-brand hover:underline">
                                  serviço #{payable.serviceOrderId}
                                </Link>
                              </>
                            )}
                          </p>
                          <Trail payable={payable} />
                          {payable.exceptionReason && <p className="text-xs text-warn">Emergência: {payable.exceptionReason}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium tabular-nums">{formatMoney(payable.amount)}</td>
                        <td className="px-4 py-3.5">
                          <StatusBadge payable={payable} />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap justify-end gap-2">
                            {payable.documentId && (
                              <Button variant="ghost" size="sm" onClick={() => openDocument(payable.documentId!)} aria-label={`Abrir a nota ou boleto de ${payable.description}`} title="Nota ou boleto">
                                <FileText aria-hidden className="size-4" />
                              </Button>
                            )}
                            {payable.receiptDocumentId && (
                              <Button variant="ghost" size="sm" onClick={() => openDocument(payable.receiptDocumentId!)}>
                                <Receipt aria-hidden className="size-4" />
                                Comprovante
                              </Button>
                            )}
                            {payable.canApprove && (
                              <Button size="sm" onClick={() => approve.mutate(payable.id)} disabled={approve.isPending}>
                                <ShieldCheck aria-hidden className="size-4" />
                                Aprovar
                              </Button>
                            )}
                            {me.canPay && payable.status === 'APPROVED' && (
                              <Button size="sm" variant="secondary" onClick={() => setPaying(payable)}>
                                <CheckCircle2 aria-hidden className="size-4" />
                                Registrar pagamento
                              </Button>
                            )}
                            {me.canPay && isOpen && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCancelling(payable)}
                                aria-label={`Cancelar ${payable.description}`}
                                className="text-danger hover:bg-danger-soft hover:text-danger"
                              >
                                <Ban aria-hidden className="size-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {!loading && visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-14 text-center text-sm text-muted">
                      {all.length === 0 ? 'Nenhuma conta lançada ainda.' : 'Nenhuma conta com esse filtro.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && <NewPayableDialog onClose={() => setCreating(false)} />}
      {paying && <PayDialog payable={paying} onClose={() => setPaying(null)} />}
      {cancelling && <CancelDialog payable={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}

