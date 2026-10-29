import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ClipboardList, Hammer, Paperclip, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { isoToday } from '@/components/ChargeResultDialog';
import { documentDigits, documentError, FileField, MoneyInput, selectClass, Textarea } from '@/components/forms';
import { FormAlert } from '@/components/PublicLayout';
import { Button, Input, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { Field, Segmented } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import {
  api,
  type Budget,
  type BudgetInput,
  type DocumentKind,
  type Payable,
  type PaymentMode,
  type PaymentTerms,
  type Priority,
  type ProblemReport,
  type ServiceInput,
  type ServiceOrder,
  type Supplier
} from '@/lib/api';
import { paymentTermsText } from '@/lib/paymentTerms';
import { formatMoney, moneyText, parseMoney } from '@/lib/utils';
import { formatDocument } from '@/pages/SuppliersPage';

// The same choices the app offers, so a report or a service reads the same wherever it was written.
const problemCategories = ['Iluminação', 'Portão', 'Interfone', 'Limpeza', 'Estrutura', 'Vazamento', 'Outro'];
const problemLocations = ['Portão', 'Interfone', 'Corredor', 'Garagem', 'Área comum'];
const serviceCategories = ['Iluminação', 'Portão', 'Interfone', 'Limpeza', 'Estrutura', 'Vazamento', 'Manutenção', 'Segurança', 'Jardinagem', 'Elétrica', 'Hidráulica', 'Pintura'];

const priorities: { value: Priority; label: string }[] = [
  { value: 'BAIXA', label: 'Baixa' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'URGENTE', label: 'Urgente' }
];

const serviceFileKinds: { value: DocumentKind; label: string }[] = [
  { value: 'NOTA_FISCAL', label: 'Nota fiscal' },
  { value: 'RECIBO', label: 'Recibo' },
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'COMPROVANTE', label: 'Foto ou comprovante' }
];

const openProblem = (report: ProblemReport) => report.status === 'ABERTO' || report.status === 'EM_ANALISE';

// A problem, its budgets, their votings and the service all move together: after any change, every list is read again.
const demandKeys = new Set(['problems', 'problem-events', 'demand-budgets', 'budgets', 'votings', 'voting', 'services', 'expenses', 'documents']);

function useRefreshDemands() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'condo' && demandKeys.has(String(query.queryKey[1])) });
}

/** What a field shows: its mistake once the person tried to save or typed something there. */
function shown(tried: boolean, value: string, error: string | null) {
  return tried || value.trim() ? error : null;
}

/** After a refused save, takes the person to the first field with a mistake: in a long form it may be out of sight. */
function focusFirstError() {
  requestAnimationFrame(() => {
    const message = document.querySelector<HTMLElement>('dialog[open] [id$="-erro"]');
    const field = message && document.getElementById(message.id.replace(/-erro$/, ''));
    field?.focus();
  });
}

function Check({ id, checked, onChange, label, hint, disabled }: { id: string; checked: boolean; onChange: (checked: boolean) => void; label: string; hint?: ReactNode; disabled?: boolean }) {
  return (
    <div className="flex gap-3 rounded-lg border border-line p-3">
      <input id={id} type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

/** A supplier name with the condominium's suppliers as suggestions; picking one fills its CPF or CNPJ and phone. */
function SupplierInput({ id, value, onChange, onPick }: { id: string; value: string; onChange: (value: string) => void; onPick: (supplier: Supplier) => void }) {
  const suppliers = useQuery({ queryKey: ['condo', 'suppliers'], queryFn: api.suppliers, retry: false });
  const active = (suppliers.data ?? []).filter((supplier) => supplier.active);
  return (
    <>
      <Input
        id={id}
        list={`${id}-lista`}
        maxLength={160}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          const picked = active.find((supplier) => supplier.name === e.target.value);
          if (picked) onPick(picked);
        }}
      />
      <datalist id={`${id}-lista`}>
        {active.map((supplier) => (
          <option key={supplier.id} value={supplier.name} />
        ))}
      </datalist>
    </>
  );
}

function SubmitFooter({ form, pending, label, onCancel }: { form: string; pending: boolean; label: string; onCancel: () => void }) {
  return (
    <>
      <Button variant="secondary" onClick={onCancel} disabled={pending}>
        Cancelar
      </Button>
      <Button type="submit" form={form} disabled={pending}>
        {pending && <Spinner />}
        {label}
      </Button>
    </>
  );
}

/** A problem registered by the administration or the síndico, with up to three photos. */
export function ProblemDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const notify = useToast();
  const refresh = useRefreshDemands();
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('Área comum');
  const [category, setCategory] = useState('Outro');
  const [priority, setPriority] = useState<Priority>('MEDIA');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [tried, setTried] = useState(false);
  const errors = {
    title: title.trim().length < 3 ? 'Diga em poucas palavras o que aconteceu.' : null,
    location: !location.trim() ? 'Informe onde é.' : null,
    description: description.trim().length < 5 ? 'Conte o que aconteceu.' : null
  };
  const valid = Object.values(errors).every((error) => !error);

  const create = useMutation({
    mutationFn: async () => {
      const report = await api.createProblem({ title: title.trim(), location: location.trim(), category, priority, description: description.trim() });
      let failed = 0;
      for (const photo of photos) {
        await api.addProblemPhoto(report.id, photo).catch(() => (failed += 1));
      }
      return { report, failed };
    },
    onSuccess: ({ report, failed }) => {
      refresh();
      notify(failed ? 'danger' : 'ok', failed ? `Problema registrado, mas ${failed === 1 ? 'uma foto não foi enviada' : `${failed} fotos não foram enviadas`}.` : 'Problema registrado.');
      onClose();
      navigate(`/condominio/problemas/${report.id}`);
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (valid) create.mutate();
    else focusFirstError();
  }

  return (
    <Dialog
      open
      onClose={() => !create.isPending && onClose()}
      icon={<TriangleAlert aria-hidden className="size-5" />}
      title="Registrar problema"
      description="Fica na lista de problemas, como os que as unidades relatam pelo aplicativo."
      size="lg"
      footer={<SubmitFooter form="novo-problema" pending={create.isPending} label="Registrar" onCancel={onClose} />}
    >
      <form id="novo-problema" onSubmit={submit} noValidate className="space-y-4">
        {create.isError && <FormAlert>{create.error.message}</FormAlert>}
        <Field label="O que aconteceu" htmlFor="problema-titulo" error={shown(tried, title, errors.title)}>
          <Input id="problema-titulo" data-autofocus maxLength={180} placeholder="Lâmpada queimada na garagem" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Onde" htmlFor="problema-local" error={tried ? errors.location : null}>
            <Input id="problema-local" list="problema-locais" maxLength={80} value={location} onChange={(e) => setLocation(e.target.value)} />
            <datalist id="problema-locais">
              {problemLocations.map((place) => (
                <option key={place} value={place} />
              ))}
            </datalist>
          </Field>
          <Field label="Categoria" htmlFor="problema-categoria">
            <select id="problema-categoria" value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
              {problemCategories.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <Field label="Prioridade" htmlFor="problema-prioridade">
            <select id="problema-prioridade" value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={selectClass}>
              {priorities.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Detalhes" htmlFor="problema-descricao" error={shown(tried, description, errors.description)}>
          <Textarea id="problema-descricao" rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Fotos" htmlFor="problema-fotos" hint={photos.length ? photos.map((photo) => photo.name).join(', ') : 'Opcional. Até 3 fotos.'}>
          <Input
            id="problema-fotos"
            type="file"
            accept="image/*"
            multiple
            className="py-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-surface-alt file:px-3 file:py-1 file:text-sm file:text-ink"
            onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 3))}
          />
        </Field>
      </form>
    </Dialog>
  );
}

/**
 * A new budget for the units to vote on (for a problem, or on its own), or changes to one still being voted. Changing
 * what people vote on (title, supplier, value, what will be done) starts the voting over.
 */
export function BudgetDialog({ budget, problem, onClose }: { budget?: Budget; problem?: ProblemReport; onClose: () => void }) {
  const navigate = useNavigate();
  const notify = useToast();
  const refresh = useRefreshDemands();
  const editing = budget != null;
  const problems = useQuery({ queryKey: ['condo', 'problems'], queryFn: api.problems, enabled: !editing });
  const voting = useQuery({ queryKey: ['condo', 'voting', budget?.id], queryFn: () => api.budgetVoting(budget!.id), enabled: editing });
  const [form, setForm] = useState(() => ({
    title: budget?.title ?? problem?.title ?? '',
    supplier: budget?.supplier ?? '',
    supplierDocument: formatDocument(budget?.supplierDocument ?? null),
    phone: budget?.phone ?? '',
    amount: budget ? moneyText(budget.amount) : '',
    budgetDate: budget?.budgetDate ?? (editing ? '' : isoToday()),
    validUntil: budget?.validUntil ?? '',
    expectedDate: budget?.expectedDate ?? '',
    votingDeadline: budget?.votingDeadline ?? '',
    scope: budget?.scope ?? '',
    notes: budget?.notes ?? '',
    problemId: problem ? String(problem.id) : '',
    competes: true,
    // New budgets say how the supplier is paid; older ones may have been saved without it.
    paymentMode: (budget ? (budget.paymentMode ?? '') : 'A_VISTA') as PaymentMode | '',
    downPayment: moneyText(budget?.downPayment),
    paymentInstallments: budget?.paymentInstallments ? String(budget.paymentInstallments) : ''
  }));
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const amount = parseMoney(form.amount);
  const deadlineChanged = form.votingDeadline !== (budget?.votingDeadline ?? '');
  const terms: PaymentTerms = {
    paymentMode: form.paymentMode || null,
    downPayment: form.paymentMode === 'ENTRADA' ? parseMoney(form.downPayment) : null,
    paymentInstallments:
      form.paymentMode === 'PARCELADO' ? Number(form.paymentInstallments || 0) : form.paymentMode === 'ENTRADA' ? Number(form.paymentInstallments || 1) : null
  };
  const errors = {
    title: form.title.trim().length < 3 ? 'Diga qual é o trabalho.' : null,
    supplier: form.supplier.trim().length < 2 ? 'Informe o fornecedor.' : null,
    amount: amount == null || Number.isNaN(amount) || amount <= 0 ? 'Informe um valor maior que zero.' : null,
    supplierDocument: documentError(form.supplierDocument),
    validUntil: form.validUntil && form.budgetDate && form.validUntil < form.budgetDate ? 'A validade não pode ser antes da data do orçamento.' : null,
    votingDeadline: form.votingDeadline && deadlineChanged && form.votingDeadline < isoToday() ? 'O fim da votação não pode estar no passado.' : null,
    downPayment:
      form.paymentMode === 'ENTRADA' && (terms.downPayment == null || Number.isNaN(terms.downPayment) || terms.downPayment <= 0 || (amount != null && terms.downPayment >= amount))
        ? 'A entrada precisa ser maior que zero e menor que o valor.'
        : null,
    paymentInstallments:
      form.paymentMode === 'PARCELADO' && !(terms.paymentInstallments! >= 2 && terms.paymentInstallments! <= 60)
        ? 'De 2 a 60 parcelas.'
        : form.paymentMode === 'ENTRADA' && !(terms.paymentInstallments! >= 1 && terms.paymentInstallments! <= 60)
          ? 'De 1 a 60 parcelas.'
          : null
  };
  const valid = Object.values(errors).every((error) => !error);
  const termsText = amount != null && !errors.amount && !errors.downPayment && !errors.paymentInstallments ? paymentTermsText({ amount, ...terms }) : null;
  const votes = voting.data ? voting.data.approveVotes + voting.data.rejectVotes : 0;
  const termsChanged =
    editing &&
    (form.title.trim() !== budget.title ||
      form.supplier.trim() !== budget.supplier ||
      amount !== Number(budget.amount) ||
      (form.scope.trim() || null) !== (budget.scope ?? null) ||
      terms.paymentMode !== budget.paymentMode ||
      (terms.paymentMode === 'ENTRADA' && Number(terms.downPayment) !== Number(budget.downPayment)) ||
      (terms.paymentMode !== 'A_VISTA' && terms.paymentMode != null && terms.paymentInstallments !== budget.paymentInstallments));

  const save = useMutation({
    mutationFn: async () => {
      const input: BudgetInput = {
        title: form.title.trim(),
        supplier: form.supplier.trim(),
        supplierDocument: documentDigits(form.supplierDocument),
        phone: form.phone.trim() || null,
        amount: amount as number,
        budgetDate: form.budgetDate || null,
        validUntil: form.validUntil || null,
        expectedDate: form.expectedDate || null,
        votingDeadline: form.votingDeadline || null,
        scope: form.scope.trim() || null,
        notes: form.notes.trim() || null,
        documentId: budget?.documentId ?? null,
        ...terms,
        ...(editing ? {} : { problemReportId: form.problemId ? Number(form.problemId) : null, competes: form.problemId ? form.competes : true })
      };
      const saved = editing ? await api.updateBudget(budget.id, input) : await api.createBudget(input);
      if (!file) return { saved, fileError: null };
      // The file belongs to the budget, so it goes after the budget exists; a failure here leaves the budget saved.
      try {
        const document = await api.uploadDocument(file, 'ORCAMENTO', { type: 'BUDGET', id: saved.id, name: `Orçamento - ${saved.supplier}` });
        return { saved: await api.updateBudget(saved.id, { ...input, documentId: document.id }), fileError: null };
      } catch (error) {
        return { saved, fileError: (error as Error).message };
      }
    },
    onSuccess: ({ saved, fileError }) => {
      refresh();
      if (fileError) notify('danger', `Orçamento salvo, mas o arquivo não foi enviado: ${fileError}`);
      else notify('ok', editing ? 'Orçamento atualizado.' : 'Orçamento cadastrado. As unidades já podem votar pelo aplicativo.');
      onClose();
      if (!editing) navigate(`/condominio/orcamentos/${saved.id}`);
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (valid) save.mutate();
    else focusFirstError();
  }

  const choosable = (problems.data ?? []).filter(openProblem);
  return (
    <Dialog
      open
      onClose={() => !save.isPending && onClose()}
      icon={<ClipboardList aria-hidden className="size-5" />}
      title={editing ? 'Editar orçamento' : 'Novo orçamento'}
      description={editing ? undefined : 'Vai para a votação das unidades assim que for cadastrado.'}
      size="lg"
      footer={<SubmitFooter form="orcamento" pending={save.isPending} label={editing ? 'Salvar' : 'Cadastrar e abrir votação'} onCancel={onClose} />}
    >
      <form id="orcamento" onSubmit={submit} noValidate className="space-y-4">
        {save.isError && <FormAlert>{save.error.message}</FormAlert>}
        {termsChanged && votes > 0 && (
          <p role="status" className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-sm">
            {votes === 1 ? 'Uma unidade já votou' : `${votes} unidades já votaram`}. Mudando título, fornecedor, valor, o que será feito ou a forma de pagamento, os votos são apagados e a votação começa de novo.
          </p>
        )}
        {!editing && (
          <Field label="Para qual problema" htmlFor="orcamento-problema" hint="Opcional. Um orçamento também pode ser de algo que ninguém relatou, como uma melhoria.">
            <select id="orcamento-problema" value={form.problemId} onChange={(e) => set('problemId', e.target.value)} className={selectClass}>
              <option value="">Nenhum</option>
              {problem && !choosable.some((item) => item.id === problem.id) && <option value={problem.id}>{problem.title}</option>}
              {choosable.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · {item.location}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!editing && form.problemId && (
          <Check
            id="orcamento-concorre"
            checked={form.competes}
            onChange={(checked) => set('competes', checked)}
            label="Concorre com os outros orçamentos deste problema"
            hint="Marcado: é o mesmo trabalho, e quando um for aprovado os outros são recusados. Desmarque se for outro trabalho do mesmo problema."
          />
        )}
        <Field label="Trabalho" htmlFor="orcamento-titulo" error={shown(tried, form.title, errors.title)}>
          <Input id="orcamento-titulo" data-autofocus maxLength={180} placeholder="Troca da boia da caixa d'água" value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fornecedor" htmlFor="orcamento-fornecedor" error={shown(tried, form.supplier, errors.supplier)}>
            <SupplierInput
              id="orcamento-fornecedor"
              value={form.supplier}
              onChange={(value) => set('supplier', value)}
              onPick={(supplier) =>
                setForm((current) => ({
                  ...current,
                  supplierDocument: current.supplierDocument || formatDocument(supplier.document),
                  phone: current.phone || (supplier.phone ?? '')
                }))
              }
            />
          </Field>
          <Field label="Valor" htmlFor="orcamento-valor" error={shown(tried, form.amount, errors.amount)}>
            <MoneyInput id="orcamento-valor" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </Field>
          <Field label="CPF ou CNPJ" htmlFor="orcamento-documento" error={errors.supplierDocument} hint="Opcional. As unidades veem só parte dos números.">
            <Input id="orcamento-documento" inputMode="numeric" maxLength={18} value={form.supplierDocument} onChange={(e) => set('supplierDocument', e.target.value)} />
          </Field>
          <Field label="Telefone" htmlFor="orcamento-telefone">
            <Input id="orcamento-telefone" type="tel" maxLength={40} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>
        <Field label="O que será feito" htmlFor="orcamento-escopo" hint="O que as unidades vão ler antes de votar.">
          <Textarea id="orcamento-escopo" maxLength={2000} value={form.scope} onChange={(e) => set('scope', e.target.value)} />
        </Field>
        <div className="space-y-3 rounded-lg border border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Forma de pagamento</p>
            <Segmented
              label="Forma de pagamento"
              value={form.paymentMode}
              onChange={(mode) => set('paymentMode', mode)}
              options={[
                ...(editing && !budget.paymentMode ? [{ value: '' as const, label: 'Não informada' }] : []),
                { value: 'A_VISTA' as const, label: 'À vista' },
                { value: 'PARCELADO' as const, label: 'Parcelado' },
                { value: 'ENTRADA' as const, label: 'Entrada + restante' }
              ]}
            />
          </div>
          {(form.paymentMode === 'PARCELADO' || form.paymentMode === 'ENTRADA') && (
            <div className="grid gap-4 sm:grid-cols-2">
              {form.paymentMode === 'ENTRADA' && (
                <Field label="Entrada" htmlFor="orcamento-entrada" error={shown(tried, form.downPayment, errors.downPayment)}>
                  <MoneyInput id="orcamento-entrada" value={form.downPayment} onChange={(e) => set('downPayment', e.target.value)} />
                </Field>
              )}
              <Field
                label={form.paymentMode === 'ENTRADA' ? 'Restante em quantas vezes' : 'Parcelas'}
                htmlFor="orcamento-parcelas"
                error={shown(tried, form.paymentInstallments, errors.paymentInstallments)}
              >
                <Input
                  id="orcamento-parcelas"
                  type="number"
                  min={form.paymentMode === 'ENTRADA' ? 1 : 2}
                  max={60}
                  placeholder={form.paymentMode === 'ENTRADA' ? '1' : '2'}
                  value={form.paymentInstallments}
                  onChange={(e) => set('paymentInstallments', e.target.value)}
                />
              </Field>
            </div>
          )}
          <p className="text-xs text-muted">
            {!form.paymentMode
              ? 'Este orçamento foi cadastrado sem a forma de pagamento.'
              : termsText
                ? `${termsText}. As unidades veem isso antes de votar.`
                : 'As unidades veem a forma de pagamento antes de votar.'}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data do orçamento" htmlFor="orcamento-data">
            <Input id="orcamento-data" type="date" value={form.budgetDate} onChange={(e) => set('budgetDate', e.target.value)} />
          </Field>
          <Field label="Válido até" htmlFor="orcamento-validade" error={errors.validUntil}>
            <Input id="orcamento-validade" type="date" value={form.validUntil} onChange={(e) => set('validUntil', e.target.value)} />
          </Field>
          <Field label="Prazo para fazer" htmlFor="orcamento-prazo">
            <Input id="orcamento-prazo" type="date" value={form.expectedDate} onChange={(e) => set('expectedDate', e.target.value)} />
          </Field>
          <Field
            label="Fim da votação"
            htmlFor="orcamento-votacao"
            error={errors.votingDeadline}
            hint="Último dia para votar. Em branco, fica aberta até todas as unidades votarem ou alguém encerrar."
          >
            <Input id="orcamento-votacao" type="date" min={isoToday()} value={form.votingDeadline} onChange={(e) => set('votingDeadline', e.target.value)} />
          </Field>
        </div>
        <FileField
          id="orcamento-arquivo"
          label={budget?.documentId ? 'Trocar o arquivo do orçamento' : 'Arquivo do orçamento'}
          hint={budget?.documentId ? 'Já tem um arquivo. Escolha outro só se for trocar.' : 'Opcional. O PDF ou a foto que o fornecedor mandou.'}
          file={file}
          onChange={setFile}
        />
        <Field label="Observações" htmlFor="orcamento-obs">
          <Input id="orcamento-obs" maxLength={500} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/**
 * A service to be done: from a budget the units approved, from a problem, or on its own when it is small. Above the
 * condominium's limit it only exists with an approved budget behind it.
 */
export function ServiceDialog({ service, budget, problem, onClose }: { service?: ServiceOrder; budget?: Budget; problem?: ProblemReport; onClose: () => void }) {
  const navigate = useNavigate();
  const notify = useToast();
  const refresh = useRefreshDemands();
  const editing = service != null;
  const budgets = useQuery({ queryKey: ['condo', 'demand-budgets'], queryFn: api.fullBudgets });
  const problems = useQuery({ queryKey: ['condo', 'problems'], queryFn: api.problems, enabled: !editing });
  const settings = useQuery({ queryKey: ['condo', 'settings'], queryFn: api.settings });
  const [form, setForm] = useState(() => ({
    title: service?.title ?? budget?.title ?? problem?.title ?? '',
    description: service?.description ?? budget?.scope ?? problem?.description ?? '',
    category: service?.category ?? problem?.category ?? '',
    priority: service?.priority ?? problem?.priority ?? ('MEDIA' as Priority),
    budgetId: String(service?.approvedBudgetId ?? budget?.id ?? ''),
    expectedValue: service?.expectedValue != null ? moneyText(service.expectedValue) : budget ? moneyText(budget.amount) : '',
    supplier: service?.supplier ?? budget?.supplier ?? '',
    supplierDocument: formatDocument(service?.supplierDocument ?? budget?.supplierDocument ?? null),
    plannedDate: service?.plannedDate ?? budget?.expectedDate ?? '',
    problemId: String(service?.problemReportId ?? budget?.problemReportId ?? problem?.id ?? ''),
    started: service?.status === 'EM_ANDAMENTO',
    notes: service?.notes ?? ''
  }));
  const [tried, setTried] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  // Approved budgets not yet turned into another service.
  const approved = (budgets.data ?? []).filter((item) => item.status === 'APROVADO' && (item.serviceId == null || item.serviceId === service?.id));
  const chosen = approved.find((item) => String(item.id) === form.budgetId) ?? null;
  const limit = settings.data?.budgetRequiredAbove ?? null;
  const expected = form.expectedValue.trim() ? parseMoney(form.expectedValue) : null;
  const expectedInvalid = form.expectedValue.trim() !== '' && (expected == null || Number.isNaN(expected) || expected <= 0);
  const errors = {
    title: form.title.trim().length < 3 ? 'Diga qual é o serviço.' : null,
    description: form.description.trim().length < 5 ? 'Descreva o que será feito.' : null,
    supplierDocument: documentError(form.supplierDocument),
    expectedValue: expectedInvalid
      ? 'Informe um valor maior que zero.'
      : form.budgetId || limit == null
        ? null
        : expected == null
          ? `Sem orçamento aprovado, informe o valor (até ${formatMoney(limit)}).`
          : expected > limit
            ? `Acima de ${formatMoney(limit)}, só com um orçamento aprovado pelas unidades.`
            : null
  };
  const valid = Object.values(errors).every((error) => !error);

  function pickBudget(id: string) {
    const picked = approved.find((item) => String(item.id) === id);
    setForm((current) =>
      picked
        ? {
            ...current,
            budgetId: id,
            title: current.title || picked.title,
            description: current.description || (picked.scope ?? ''),
            supplier: picked.supplier,
            supplierDocument: formatDocument(picked.supplierDocument),
            expectedValue: moneyText(picked.amount),
            plannedDate: current.plannedDate || (picked.expectedDate ?? ''),
            problemId: editing ? current.problemId : picked.problemReportId != null ? String(picked.problemReportId) : current.problemId
          }
        : { ...current, budgetId: '' }
    );
  }

  const save = useMutation({
    mutationFn: () => {
      const input: ServiceInput = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim() || null,
        priority: form.priority,
        status: form.started ? 'EM_ANDAMENTO' : 'PLANEJADO',
        expectedValue: expected,
        supplier: form.supplier.trim() || null,
        supplierDocument: documentDigits(form.supplierDocument),
        plannedDate: form.plannedDate || null,
        approvedBudgetId: form.budgetId ? Number(form.budgetId) : null,
        notes: form.notes.trim() || null,
        ...(editing ? {} : { problemReportId: form.problemId ? Number(form.problemId) : null })
      };
      return editing ? api.updateService(service.id, input) : api.createService(input);
    },
    onSuccess: (saved) => {
      refresh();
      notify('ok', editing ? 'Serviço atualizado.' : 'Serviço aberto.');
      onClose();
      if (!editing) navigate(`/condominio/servicos/${saved.id}`);
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (valid) save.mutate();
    else focusFirstError();
  }

  const choosable = (problems.data ?? []).filter(openProblem);
  return (
    <Dialog
      open
      onClose={() => !save.isPending && onClose()}
      icon={<Hammer aria-hidden className="size-5" />}
      title={editing ? 'Editar serviço' : 'Novo serviço'}
      size="lg"
      footer={<SubmitFooter form="servico" pending={save.isPending} label={editing ? 'Salvar' : 'Abrir serviço'} onCancel={onClose} />}
    >
      <form id="servico" onSubmit={submit} noValidate className="space-y-4">
        {save.isError && <FormAlert>{save.error.message}</FormAlert>}
        <Field
          label="Orçamento aprovado"
          htmlFor="servico-orcamento"
          hint={
            chosen
              ? `Aprovado pelas unidades: ${formatMoney(chosen.amount)}. Na hora de pagar, dá para passar dele em até 10%.`
              : limit != null
                ? `Sem orçamento aprovado, só serviços de até ${formatMoney(limit)}.`
                : 'Opcional. Escolha se o serviço vem de um orçamento votado.'
          }
        >
          <select id="servico-orcamento" value={form.budgetId} onChange={(e) => pickBudget(e.target.value)} className={selectClass}>
            <option value="">Nenhum</option>
            {approved.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title} · {item.supplier} · {formatMoney(item.amount)}
              </option>
            ))}
          </select>
        </Field>
        {!editing && (
          <Field label="Problema de origem" htmlFor="servico-problema" hint="Opcional. Quando o serviço for finalizado, o problema é dado como resolvido.">
            <select id="servico-problema" value={form.problemId} onChange={(e) => set('problemId', e.target.value)} className={selectClass}>
              <option value="">Nenhum</option>
              {form.problemId && !choosable.some((item) => String(item.id) === form.problemId) && (
                <option value={form.problemId}>{problem?.title ?? `Problema #${form.problemId}`}</option>
              )}
              {choosable.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · {item.location}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Serviço" htmlFor="servico-titulo" error={shown(tried, form.title, errors.title)}>
          <Input id="servico-titulo" data-autofocus maxLength={180} value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="O que será feito" htmlFor="servico-descricao" error={shown(tried, form.description, errors.description)}>
          <Textarea id="servico-descricao" maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoria" htmlFor="servico-categoria">
            <Input id="servico-categoria" list="servico-categorias" maxLength={80} value={form.category} onChange={(e) => set('category', e.target.value)} />
            <datalist id="servico-categorias">
              {serviceCategories.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field label="Prioridade" htmlFor="servico-prioridade">
            <select id="servico-prioridade" value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)} className={selectClass}>
              {priorities.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fornecedor" htmlFor="servico-fornecedor">
            <SupplierInput
              id="servico-fornecedor"
              value={form.supplier}
              onChange={(value) => set('supplier', value)}
              onPick={(supplier) => setForm((current) => ({ ...current, supplierDocument: current.supplierDocument || formatDocument(supplier.document) }))}
            />
          </Field>
          <Field label="CPF ou CNPJ" htmlFor="servico-documento" error={errors.supplierDocument}>
            <Input id="servico-documento" inputMode="numeric" maxLength={18} value={form.supplierDocument} onChange={(e) => set('supplierDocument', e.target.value)} />
          </Field>
          <Field label="Valor previsto" htmlFor="servico-valor" error={tried || form.expectedValue ? errors.expectedValue : null}>
            <MoneyInput id="servico-valor" value={form.expectedValue} onChange={(e) => set('expectedValue', e.target.value)} />
          </Field>
          <Field label="Data planejada" htmlFor="servico-data">
            <Input id="servico-data" type="date" value={form.plannedDate} onChange={(e) => set('plannedDate', e.target.value)} />
          </Field>
        </div>
        <Check id="servico-iniciado" checked={form.started} onChange={(checked) => set('started', checked)} label="O trabalho já começou" hint="Aparece como “Em andamento” para as unidades." />
        <Field label="Observações" htmlFor="servico-obs">
          <Input id="servico-obs" maxLength={500} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/**
 * The end of a service: what was paid, when, to whom, with the invoice. The payment goes to the cash box as an expense,
 * and beyond what the units approved (10% of room) or the limit it needs an emergency justification everybody reads.
 */
export function FinishServiceDialog({ service, onClose }: { service: ServiceOrder; onClose: () => void }) {
  const notify = useToast();
  const refresh = useRefreshDemands();
  const budgets = useQuery({ queryKey: ['condo', 'demand-budgets'], queryFn: api.fullBudgets });
  const settings = useQuery({ queryKey: ['condo', 'settings'], queryFn: api.settings });
  const expenses = useQuery({ queryKey: ['condo', 'expenses'], queryFn: api.expenses });
  const bills = useQuery({ queryKey: ['condo', 'payables'], queryFn: api.payables });
  const queryClient = useQueryClient();
  // Paid through bills (a down payment, installments), each bill books itself when paid: finishing books nothing.
  const billsOf = (list: Payable[] | undefined) => (list ?? []).filter((bill) => bill.serviceOrderId === service.id && bill.status !== 'CANCELLED');
  const serviceBills = billsOf(bills.data);
  const billed = serviceBills.reduce((sum, bill) => sum + Number(bill.amount), 0);
  const booked = serviceBills.length > 0 || (expenses.data ?? []).some((expense) => expense.serviceOrderId === service.id);
  const [form, setForm] = useState(() => ({
    finalValue: moneyText(
      service.finalValue ?? (billsOf(queryClient.getQueryData<Payable[]>(['condo', 'payables'])).reduce((sum, bill) => sum + Number(bill.amount), 0) || service.expectedValue)
    ),
    completedDate: isoToday(),
    supplier: service.supplier ?? '',
    supplierDocument: formatDocument(service.supplierDocument),
    notes: service.notes ?? '',
    generateExpense: true,
    reason: ''
  }));
  const [file, setFile] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  const approved = (budgets.data ?? []).find((budget) => budget.id === service.approvedBudgetId) ?? null;
  const limit = settings.data?.budgetRequiredAbove ?? null;
  const ceiling = approved ? Math.round(Number(approved.amount) * 1.1 * 100) / 100 : limit;
  const paid = parseMoney(form.finalValue);
  const outside = ceiling != null && paid != null && paid > ceiling;
  const expense = form.generateExpense && !booked;
  const errors = {
    finalValue: paid == null || Number.isNaN(paid) || paid <= 0 ? 'Informe o valor pago, maior que zero.' : null,
    completedDate: !form.completedDate ? 'Informe quando terminou.' : null,
    supplier: form.supplier.trim().length < 2 ? 'Informe quem fez o serviço.' : null,
    supplierDocument: documentError(form.supplierDocument),
    reason: outside && form.reason.trim().length < 20 ? 'Escreva a justificativa, com pelo menos 20 letras.' : null
  };
  const valid = Object.values(errors).every((error) => !error);

  const finish = useMutation({
    mutationFn: async () => {
      const document = file ? await api.uploadDocument(file, 'NOTA_FISCAL', { type: 'SERVICE', id: service.id, name: `Nota fiscal - ${service.title}` }) : null;
      return api.finishService(service.id, {
        finalValue: paid as number,
        completedDate: form.completedDate,
        supplier: form.supplier.trim(),
        supplierDocument: documentDigits(form.supplierDocument),
        documentId: document?.id ?? null,
        generateExpense: expense,
        notes: form.notes.trim() || null,
        emergencyReason: outside ? form.reason.trim() : null
      });
    },
    onSuccess: () => {
      refresh();
      notify('ok', expense ? 'Serviço finalizado. O pagamento entrou no caixa.' : 'Serviço finalizado.');
      onClose();
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (valid) finish.mutate();
    else focusFirstError();
  }

  return (
    <Dialog
      open
      onClose={() => !finish.isPending && onClose()}
      icon={<CheckCircle2 aria-hidden className="size-5" />}
      tone="ok"
      title="Finalizar serviço"
      description={service.title}
      size="lg"
      footer={<SubmitFooter form="finalizar" pending={finish.isPending} label="Finalizar serviço" onCancel={onClose} />}
    >
      <form id="finalizar" onSubmit={submit} noValidate className="space-y-4">
        {finish.isError && <FormAlert>{finish.error.message}</FormAlert>}
        {ceiling != null && (
          <p className="text-sm text-muted">
            {approved
              ? `Orçamento aprovado pelas unidades: ${formatMoney(approved.amount)} (${approved.supplier}). Dá para pagar até ${formatMoney(ceiling)}, com 10% de folga.`
              : `Este serviço não tem orçamento aprovado: sem votação, só dá para pagar até ${formatMoney(ceiling)}.`}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor pago" htmlFor="finalizar-valor" error={shown(tried, form.finalValue, errors.finalValue)}>
            <MoneyInput id="finalizar-valor" data-autofocus value={form.finalValue} onChange={(e) => set('finalValue', e.target.value)} />
          </Field>
          <Field label="Terminou em" htmlFor="finalizar-data" error={tried ? errors.completedDate : null}>
            <Input id="finalizar-data" type="date" value={form.completedDate} onChange={(e) => set('completedDate', e.target.value)} />
          </Field>
          <Field label="Quem fez" htmlFor="finalizar-fornecedor" error={shown(tried, form.supplier, errors.supplier)}>
            <SupplierInput
              id="finalizar-fornecedor"
              value={form.supplier}
              onChange={(value) => set('supplier', value)}
              onPick={(supplier) => setForm((current) => ({ ...current, supplierDocument: current.supplierDocument || formatDocument(supplier.document) }))}
            />
          </Field>
          <Field label="CPF ou CNPJ" htmlFor="finalizar-documento" error={errors.supplierDocument}>
            <Input id="finalizar-documento" inputMode="numeric" maxLength={18} value={form.supplierDocument} onChange={(e) => set('supplierDocument', e.target.value)} />
          </Field>
        </div>
        {outside && (
          <Field
            label="Justificativa de emergência"
            htmlFor="finalizar-justificativa"
            error={shown(tried, form.reason, errors.reason)}
            hint="Este valor passa do que as unidades aprovaram. A justificativa aparece para todas elas, no serviço e na prestação de contas."
          >
            <Textarea id="finalizar-justificativa" maxLength={1000} placeholder="Por que foi preciso pagar sem a votação? Ex.: o cano estourou e a rua ficou sem água." value={form.reason} onChange={(e) => set('reason', e.target.value)} />
          </Field>
        )}
        <FileField id="finalizar-nota" label="Nota fiscal ou recibo" hint="Opcional. PDF ou foto; fica no serviço e na despesa." file={file} onChange={setFile} />
        <Check
          id="finalizar-despesa"
          checked={expense}
          disabled={booked}
          onChange={(checked) => set('generateExpense', checked)}
          label="Lançar o pagamento no caixa"
          hint={
            serviceBills.length > 0
              ? `Este serviço é pago pelas contas a pagar (${formatMoney(billed)} lançados): cada conta entra no caixa quando é paga.`
              : booked
                ? 'A despesa deste serviço já foi lançada.'
                : 'Vira uma despesa (Pix) e aparece na prestação de contas para todas as unidades.'
          }
        />
        <Field label="Observações" htmlFor="finalizar-obs">
          <Input id="finalizar-obs" maxLength={500} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Dialog>
  );
}

/** A file kept with a service: the invoice, the receipt, the contract, a photo of the finished work. */
export function AttachServiceFileDialog({ serviceId, onClose }: { serviceId: number; onClose: () => void }) {
  const notify = useToast();
  const refresh = useRefreshDemands();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocumentKind>('NOTA_FISCAL');
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);

  const upload = useMutation({
    mutationFn: () => api.uploadDocument(file as File, kind, { type: 'SERVICE', id: serviceId, name: name.trim() || file?.name.replace(/\.[^.]+$/, '') }),
    onSuccess: () => {
      refresh();
      notify('ok', 'Arquivo anexado ao serviço.');
      onClose();
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    if (file) upload.mutate();
  }

  return (
    <Dialog
      open
      onClose={() => !upload.isPending && onClose()}
      icon={<Paperclip aria-hidden className="size-5" />}
      title="Anexar arquivo"
      description="Fica no serviço, para a prestação de contas."
      footer={<SubmitFooter form="anexo" pending={upload.isPending} label="Anexar" onCancel={onClose} />}
    >
      <form id="anexo" onSubmit={submit} noValidate className="space-y-4">
        {upload.isError && <FormAlert>{upload.error.message}</FormAlert>}
        <FileField id="anexo-arquivo" label="Arquivo" hint="PDF ou foto, até 10 MB." file={file} onChange={setFile} />
        {tried && !file && <p className="-mt-2 text-xs text-danger">Escolha o arquivo.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" htmlFor="anexo-tipo">
            <select id="anexo-tipo" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)} className={selectClass}>
              {serviceFileKinds.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nome" htmlFor="anexo-nome" hint="Opcional. Sem nome, vale o do arquivo.">
            <Input id="anexo-nome" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
      </form>
    </Dialog>
  );
}
