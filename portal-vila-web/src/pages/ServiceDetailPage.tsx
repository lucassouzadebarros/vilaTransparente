import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, CheckCircle2, FileText, Paperclip, Pencil, Plus, Siren } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AttachServiceFileDialog, FinishServiceDialog, ServiceDialog } from '@/components/demandForms';
import { budgetStatuses, Fact, LinkRow, PriorityBadge, problemStatuses, serviceStatuses, SideCard, StatusBadge } from '@/components/demands';
import { FormAlert } from '@/components/PublicLayout';
import { Badge, Button, Card, Skeleton, Spinner } from '@/components/ui';
import { Dialog } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page';
import { useToast } from '@/components/ui/toast';
import { api, type Payable } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { paymentTermsText } from '@/lib/paymentTerms';
import { formatDate, formatMoney, useDocumentTitle } from '@/lib/utils';
import { NewPayableDialog, PayDialog, serviceSpending } from '@/pages/PayablesPage';
import { formatDocument } from '@/pages/SuppliersPage';

function BillBadge({ bill }: { bill: Payable }) {
  if (bill.status === 'PAID') return <Badge tone="ok">Pago</Badge>;
  if (bill.status === 'PENDING_APPROVAL') return <Badge tone="warn">Aguardando aprovação</Badge>;
  return bill.overdue ? <Badge tone="danger">Vencida</Badge> : <Badge tone="brand">A pagar</Badge>;
}

/** One service: what was done, by whom and for how much, the quotes behind it, its files and the payment. */
export function ServiceDetailPage() {
  const me = useSession();
  const id = Number(useParams().id);
  const queryClient = useQueryClient();
  const notify = useToast();
  const services = useQuery({ queryKey: ['condo', 'services'], queryFn: api.services });
  const budgets = useQuery({ queryKey: ['condo', 'demand-budgets'], queryFn: api.fullBudgets });
  const problems = useQuery({ queryKey: ['condo', 'problems'], queryFn: api.problems });
  const expenses = useQuery({ queryKey: ['condo', 'expenses'], queryFn: api.expenses });
  const bills = useQuery({ queryKey: ['condo', 'payables'], queryFn: api.payables });
  const settings = useQuery({ queryKey: ['condo', 'settings'], queryFn: api.settings });
  const documents = useQuery({ queryKey: ['condo', 'documents', 'SERVICE', id], queryFn: () => api.documents('SERVICE', id) });
  const service = services.data?.find((item) => item.id === id);
  useDocumentTitle(service?.title ?? 'Serviço');
  const [confirm, setConfirm] = useState(false);
  const [dialog, setDialog] = useState<'edit' | 'finish' | 'attach' | 'pay' | null>(null);
  const [paying, setPaying] = useState<Payable | null>(null);

  const cancel = useMutation({
    mutationFn: () => api.cancelService(id),
    onSuccess: () => {
      setConfirm(false);
      queryClient.invalidateQueries({ queryKey: ['condo', 'services'] });
      queryClient.invalidateQueries({ queryKey: ['condo', 'demand-budgets'] });
      queryClient.invalidateQueries({ queryKey: ['condo', 'problems'] });
      queryClient.invalidateQueries({ queryKey: ['condo', 'payables'] });
      notify('ok', 'Serviço cancelado.');
    }
  });

  if (services.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (!service) {
    return (
      <Card role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <AlertTriangle aria-hidden className="size-6 text-danger" />
        <p className="text-sm text-muted">{services.error?.message ?? 'Este serviço não foi encontrado.'}</p>
      </Card>
    );
  }

  const problem = problems.data?.find((item) => item.id === service.problemReportId);
  const quotes = (budgets.data ?? []).filter((budget) => budget.serviceId === service.id || budget.id === service.approvedBudgetId);
  const approved = (budgets.data ?? []).find((budget) => budget.id === service.approvedBudgetId) ?? null;
  const spending = serviceSpending(service, bills.data ?? [], expenses.data ?? [], approved, settings.data?.budgetRequiredAbove ?? null);
  const total = Number(service.finalValue ?? service.expectedValue ?? approved?.amount ?? 0);
  // The bills of the service (its down payment, installments) and what was booked without a bill, when it was finished.
  const billed = new Set(spending.bills.map((bill) => bill.expenseId).filter(Boolean));
  const rows = [
    ...[...spending.bills]
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id)
      .map((bill) => ({
        key: `conta-${bill.id}`,
        title: bill.description + (bill.installments ? ` (${bill.installment}/${bill.installments})` : ''),
        detail: bill.status === 'PAID' ? `Pago em ${formatDate(bill.paidAt)}${bill.paymentMethod ? ` · ${bill.paymentMethod}` : ''}` : `Vence em ${formatDate(bill.dueDate)}`,
        amount: bill.amount,
        documentId: bill.receiptDocumentId,
        badge: <BillBadge bill={bill} />,
        payable: me.canPay && bill.status === 'APPROVED' ? bill : null
      })),
    ...(expenses.data ?? [])
      .filter((expense) => expense.serviceOrderId === service.id && !billed.has(expense.id))
      .map((expense) => ({
        key: `despesa-${expense.id}`,
        title: expense.description,
        detail: [formatDate(expense.expenseDate), expense.paymentMethod, expense.supplier].filter(Boolean).join(' · '),
        amount: expense.amount,
        documentId: expense.documentId,
        badge: <Badge tone="ok">Pago</Badge>,
        payable: null
      }))
  ];
  const files = documents.data ?? [];
  const cancellable = service.status !== 'FINALIZADO' && service.status !== 'CANCELADO';
  const openBills = spending.bills.filter((bill) => bill.status !== 'PAID');

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: me.condominium!.name, to: me.role === 'ADMIN' ? '/condominio' : '/condominio/contas' }, { label: 'Serviços', to: '/condominio/servicos' }, { label: service.title }]}
        title={service.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={service.status} table={serviceStatuses} />
            <PriorityBadge priority={service.priority} />
            {service.category && <span>{service.category}</span>}
          </span>
        }
        actions={
          cancellable && (
            <>
              {me.role === 'ADMIN' && (
                <Button onClick={() => setDialog('finish')}>
                  <CheckCircle2 aria-hidden className="size-4" />
                  Finalizar
                </Button>
              )}
              <Button variant="secondary" onClick={() => setDialog('edit')}>
                <Pencil aria-hidden className="size-4" />
                Editar
              </Button>
              <Button variant="danger-outline" onClick={() => setConfirm(true)}>
                <Ban aria-hidden className="size-4" />
                Cancelar serviço
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="min-w-0 space-y-6">
          {service.emergencyReason && (
            <div className="flex gap-3 rounded-xl border border-warn/40 bg-warn-soft p-4 text-sm">
              <Siren aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
              <div>
                <p className="font-medium">{service.approvedBudgetId ? 'Pago acima do orçamento aprovado (emergência)' : 'Pago sem orçamento aprovado (emergência)'}</p>
                <p className="mt-0.5 whitespace-pre-line text-muted">{service.emergencyReason}</p>
              </div>
            </div>
          )}

          <Card className="space-y-5 p-5">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Fact label="Fornecedor">{service.supplier ?? '—'}</Fact>
              <Fact label="CPF ou CNPJ">{service.supplierDocument ? formatDocument(service.supplierDocument) : '—'}</Fact>
              <Fact label="Categoria">{service.category ?? '—'}</Fact>
              <Fact label="Valor previsto">{service.expectedValue != null ? formatMoney(service.expectedValue) : '—'}</Fact>
              <Fact label="Valor final">{service.finalValue != null ? <span className="font-semibold">{formatMoney(service.finalValue)}</span> : '—'}</Fact>
              <Fact label="Cadastrado em">{formatDate(service.createdAt)}</Fact>
              <Fact label="Data planejada">{formatDate(service.plannedDate)}</Fact>
              <Fact label="Concluído em">{formatDate(service.completedDate)}</Fact>
            </dl>
            <div>
              <p className="text-xs text-muted">Descrição</p>
              <p className="mt-1 whitespace-pre-line text-sm">{service.description}</p>
            </div>
            {service.notes && (
              <div>
                <p className="text-xs text-muted">Observações</p>
                <p className="mt-1 whitespace-pre-line text-sm">{service.notes}</p>
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Pagamento</h2>
              {me.canPay && service.status !== 'CANCELADO' && (
                <Button size="sm" variant="secondary" onClick={() => setDialog('pay')}>
                  <Plus aria-hidden className="size-4" />
                  Lançar pagamento
                </Button>
              )}
            </div>
            {approved && (
              <p className="text-sm">
                <span className="text-muted">Forma combinada na votação: </span>
                {paymentTermsText(approved) ?? <span className="text-muted">não informada</span>}
              </p>
            )}
            {expenses.isPending || bills.isPending ? (
              <Skeleton className="h-12 rounded-lg" />
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted">
                {service.status === 'FINALIZADO'
                  ? 'Nenhum pagamento ligado a este serviço.'
                  : me.canPay
                    ? 'Nenhum pagamento lançado ainda. Use “Lançar pagamento” para a entrada, as parcelas ou o valor todo.'
                    : 'Nenhum pagamento lançado ainda.'}
              </p>
            ) : (
              <>
                {total > 0 && (
                  <div className="space-y-1">
                    <div className="flex h-2 overflow-hidden rounded-full bg-surface-alt" aria-hidden>
                      <span className="bg-ok" style={{ width: `${Math.min(100, (spending.paid / total) * 100)}%` }} />
                      <span className="bg-brand/40" style={{ width: `${Math.min(100, (Math.max(0, spending.committed - spending.paid) / total) * 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted tabular-nums">
                      {formatMoney(spending.paid)} pago de {formatMoney(total)}
                      {spending.committed > spending.paid && ` · ${formatMoney(spending.committed - spending.paid)} a pagar`}
                    </p>
                  </div>
                )}
                <ul className="divide-y divide-line">
                  {rows.map((row) => (
                    <li key={row.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.title}</p>
                        <p className="text-xs text-muted">{row.detail}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {row.badge}
                        <span className="font-semibold tabular-nums">{formatMoney(row.amount)}</span>
                        {row.documentId && (
                          <Button variant="ghost" size="sm" onClick={() => api.openDocument(row.documentId!).catch((error: Error) => notify('danger', error.message))}>
                            <FileText aria-hidden className="size-4" />
                            Comprovante
                          </Button>
                        )}
                        {row.payable && (
                          <Button size="sm" variant="secondary" onClick={() => setPaying(row.payable)}>
                            Pagar
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <SideCard title="De onde veio">
            {problem ? (
              <LinkRow to={`/condominio/problemas/${problem.id}`} title={problem.title} detail={problem.location} badge={<StatusBadge status={problem.status} table={problemStatuses} />} />
            ) : (
              <p className="text-sm text-muted">Não está ligado a um problema relatado.</p>
            )}
          </SideCard>
          <SideCard title="Orçamentos">
            {quotes.length === 0 ? (
              <p className="text-sm text-muted">Nenhum orçamento para este serviço.</p>
            ) : (
              quotes.map((budget) => (
                <LinkRow
                  key={budget.id}
                  to={`/condominio/orcamentos/${budget.id}`}
                  title={budget.supplier}
                  detail={`${formatMoney(budget.amount)}${budget.id === service.approvedBudgetId ? ' · escolhido' : ''}`}
                  badge={<StatusBadge status={budget.status} table={budgetStatuses} />}
                />
              ))
            )}
          </SideCard>
          <SideCard
            title="Arquivos"
            action={
              service.status !== 'CANCELADO' && (
                <Button size="sm" variant="secondary" onClick={() => setDialog('attach')}>
                  <Paperclip aria-hidden className="size-4" />
                  Anexar
                </Button>
              )
            }
          >
            {documents.isPending ? (
              <Skeleton className="h-10 rounded-lg" />
            ) : files.length === 0 ? (
              <p className="text-sm text-muted">Nenhum arquivo (nota, recibo, foto) anexado.</p>
            ) : (
              <ul className="space-y-1">
                {files.map((file) => (
                  <li key={file.id}>
                    <button
                      type="button"
                      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-surface-alt"
                      onClick={() => api.openDocument(file.id).catch((error: Error) => notify('danger', error.message))}
                    >
                      <FileText aria-hidden className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-muted">{formatDate(file.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SideCard>
        </div>
      </div>

      {dialog === 'edit' && <ServiceDialog service={service} onClose={() => setDialog(null)} />}
      {dialog === 'finish' && <FinishServiceDialog service={service} onClose={() => setDialog(null)} />}
      {dialog === 'attach' && <AttachServiceFileDialog serviceId={service.id} onClose={() => setDialog(null)} />}
      {dialog === 'pay' && <NewPayableDialog service={service} onClose={() => setDialog(null)} />}
      {paying && <PayDialog payable={paying} onClose={() => setPaying(null)} />}

      <Dialog
        open={confirm}
        onClose={() => !cancel.isPending && setConfirm(false)}
        tone="danger"
        size="sm"
        icon={<Ban aria-hidden className="size-5" />}
        title="Cancelar este serviço?"
        description={
          <>
            Os orçamentos dele ainda em votação também são cancelados. Se veio de um problema e não sobrar nada ativo, o problema volta para os abertos.
            {openBills.length > 0 && ` As ${openBills.length === 1 ? 'conta ainda não paga' : `${openBills.length} contas ainda não pagas`} dele também são canceladas.`}
            {spending.paid > 0 && ` O que já foi pago (${formatMoney(spending.paid)}) continua no caixa: combine a devolução com o fornecedor.`}
          </>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)} disabled={cancel.isPending} data-autofocus>
              Voltar
            </Button>
            <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              {cancel.isPending && <Spinner />}
              Cancelar serviço
            </Button>
          </>
        }
      >
        {cancel.isError && <FormAlert>{cancel.error.message}</FormAlert>}
      </Dialog>
    </div>
  );
}
