import type {
  AuditEntry,
  Budget,
  BudgetVoting,
  Contribution,
  Dashboard,
  Expense,
  HouseOption,
  Invite,
  Movement,
  MonthlyReport,
  PixCharge,
  PortalDocument,
  ProblemReport,
  ProblemReportEvent,
  Reconciliation,
  Resident,
  ServiceOrder,
  Sindico,
  WebhookEvent
} from '../types';

/**
 * Example data for the demonstration mode: an imaginary condominium ("Condomínio Exemplo"), with made-up names and
 * values. Nothing here is real, and dates follow today's month so the screens never look stale.
 */
export const MONTHLY_AMOUNT = 250;
const HOUSE_COUNT = 12;
const OCCUPIED_HOUSES = 10;
const OPENING_BALANCE = 3200;
const DEMO_NOTE = 'Código de exemplo: não é um Pix de verdade.';

const pad = (value: number) => String(value).padStart(2, '0');
const houseLabel = (number: number) => `Casa ${pad(number)}`;

export function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7);
}

const dayOf = (month: string, day: number) => `${month}-${pad(day)}`;
const stamp = (month: string, day: number, time = '10:00:00') => `${dayOf(month, day)}T${time}`;

export function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

function offsetDay(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function offsetStamp(days: number) {
  return `${offsetDay(days)}T09:00:00`;
}

// ---- Residents and houses -------------------------------------------------------------------------------------

export function residents(): Resident[] {
  return Array.from({ length: OCCUPIED_HOUSES }, (_, index) => {
    const number = index + 1;
    return {
      id: number,
      houseId: number,
      name: `Morador ${pad(number)} (exemplo)`,
      email: `casa${pad(number)}@exemplo.invalid`,
      phone: `(11) 90000-00${pad(number)}`,
      documentMasked: '***.***.***-00',
      documentRegistered: true,
      gatewayCustomerId: `cus_demo_${pad(number)}`,
      status: 'ACTIVE'
    };
  });
}

export function houses(): HouseOption[] {
  return Array.from({ length: HOUSE_COUNT }, (_, index) => {
    const number = index + 1;
    return { houseId: number, number, label: houseLabel(number), available: number > OCCUPIED_HOUSES, invited: number === 11 };
  });
}

export function invites(): Invite[] {
  return [{
    id: 1,
    houseId: 11,
    houseNumber: 11,
    houseLabel: houseLabel(11),
    createdAt: offsetStamp(-2),
    expiresAt: offsetStamp(5),
    createdBy: 'admin@exemplo.invalid'
  }];
}

export function sindico(): Sindico {
  return { residentId: 2, name: 'Morador 02 (exemplo)', houseId: 2, houseLabel: houseLabel(2) };
}

export function settings() {
  return {
    villageName: 'Condomínio Exemplo',
    monthlyAmount: MONTHLY_AMOUNT,
    paymentDueDay: 10,
    gatewayProvider: 'ASAAS',
    budgetRequiredAbove: 1000
  };
}

// ---- Contributions and Pix charges ------------------------------------------------------------------------------

function contributionStatus(month: string, house: number) {
  const current = thisMonth();
  if (month < current) {
    return 'PAID';
  }
  if (month > current) {
    return 'PENDING';
  }
  if (house === 10) {
    return 'OVERDUE';
  }
  // Houses 2 to 7 paid already; 1, 8 and 9 are still open (house 1 is the resident of the demonstration).
  return house >= 2 && house <= 7 ? 'PAID' : 'PENDING';
}

function monthIndex(month: string) {
  const [year, value] = month.split('-').map(Number);
  return (year - 2020) * 12 + value;
}

const chargeId = (month: string, house: number) => monthIndex(month) * 20 + house;

export function contributions(month: string): Contribution[] {
  return Array.from({ length: OCCUPIED_HOUSES }, (_, index) => {
    const house = index + 1;
    const status = contributionStatus(month, house);
    const paid = status === 'PAID';
    return {
      id: chargeId(month, house),
      houseId: house,
      houseLabel: houseLabel(house),
      residentId: house,
      residentName: `Morador ${pad(house)} (exemplo)`,
      month,
      amount: MONTHLY_AMOUNT,
      paidAmount: paid ? MONTHLY_AMOUNT : undefined,
      status,
      paymentDate: paid ? stamp(month, 2 + house, '09:30:00') : undefined,
      manualPayment: paid && house === 7 && month === thisMonth(),
      pixChargeId: chargeId(month, house)
    };
  });
}

export function pixCharges(month: string): PixCharge[] {
  return contributions(month).map((item) => {
    const open = item.status !== 'PAID';
    return {
      id: item.id,
      contributionId: item.id,
      houseId: item.houseId,
      houseLabel: item.houseLabel,
      residentName: item.residentName,
      month,
      gateway: 'ASAAS',
      gatewayPaymentId: `pay_demo_${item.id}`,
      externalReference: `demo-${month}-${pad(item.houseId)}`,
      value: MONTHLY_AMOUNT,
      dueDate: dayOf(month, 10),
      status: item.status,
      pixCopyPaste: open ? `${DEMO_NOTE} (${houseLabel(item.houseId)}, ${month})` : undefined,
      paidAt: item.paymentDate
    };
  });
}

export function allPixCharges(): PixCharge[] {
  const current = thisMonth();
  return [...pixCharges(current), ...pixCharges(shiftMonth(current, -1))];
}

// ---- Expenses, documents ---------------------------------------------------------------------------------------

type Spec = { id: number; month: number; day: number; description: string; category: string; amount: number; supplier: string; documentId?: number; budgetId?: number; serviceOrderId?: number };

const expenseSpecs: Spec[] = [
  { id: 1, month: 0, day: 5, description: 'Energia elétrica das áreas comuns', category: 'Energia', amount: 480.35, supplier: 'Companhia de Energia (exemplo)', documentId: 1 },
  { id: 2, month: 0, day: 6, description: 'Água e esgoto', category: 'Água', amount: 215.4, supplier: 'Companhia de Águas (exemplo)', documentId: 2 },
  { id: 3, month: 0, day: 8, description: 'Limpeza e conservação', category: 'Limpeza', amount: 600, supplier: 'Limpeza Exemplo ME', documentId: 3 },
  { id: 4, month: 0, day: 9, description: 'Conserto do portão da garagem', category: 'Manutenção', amount: 1850, supplier: 'Serralheria Exemplo Ltda', documentId: 4, budgetId: 2, serviceOrderId: 1 },
  { id: 5, month: -1, day: 5, description: 'Energia elétrica das áreas comuns', category: 'Energia', amount: 455.1, supplier: 'Companhia de Energia (exemplo)', documentId: 5 },
  { id: 6, month: -1, day: 6, description: 'Água e esgoto', category: 'Água', amount: 198.7, supplier: 'Companhia de Águas (exemplo)', documentId: 6 },
  { id: 7, month: -1, day: 8, description: 'Limpeza e conservação', category: 'Limpeza', amount: 600, supplier: 'Limpeza Exemplo ME', documentId: 7 },
  { id: 8, month: -1, day: 15, description: 'Vigilância noturna', category: 'Segurança', amount: 900, supplier: 'Segurança Exemplo' }
];

export function expenses(): Expense[] {
  const current = thisMonth();
  return expenseSpecs.map((spec) => ({
    id: spec.id,
    description: spec.description,
    category: spec.category,
    amount: spec.amount,
    expenseDate: dayOf(shiftMonth(current, spec.month), spec.day),
    supplier: spec.supplier,
    paymentMethod: 'PIX',
    notes: 'Despesa de exemplo.',
    documentId: spec.documentId,
    budgetId: spec.budgetId,
    serviceOrderId: spec.serviceOrderId
  }));
}

export function documents(): PortalDocument[] {
  const current = thisMonth();
  const sample = 'https://example.com/';
  const expenseDocs: PortalDocument[] = expenseSpecs.filter((spec) => spec.documentId).map((spec) => ({
    id: spec.documentId,
    name: `Nota fiscal - ${spec.description}`,
    type: 'NOTA_FISCAL',
    url: sample,
    relatedType: 'EXPENSE',
    relatedId: spec.id,
    description: 'Documento de exemplo.',
    createdAt: stamp(shiftMonth(current, spec.month), spec.day)
  }));
  return [
    ...expenseDocs,
    { id: 8, name: 'Ata da assembleia (exemplo)', type: 'ATA', url: sample, description: 'Documento de exemplo.', createdAt: offsetStamp(-40) },
    { id: 9, name: 'Orçamento - pintura, opção 1', type: 'ORCAMENTO', url: sample, relatedType: 'BUDGET', relatedId: 3, createdAt: offsetStamp(-6) },
    { id: 10, name: 'Orçamento - pintura, opção 2', type: 'ORCAMENTO', url: sample, relatedType: 'BUDGET', relatedId: 4, createdAt: offsetStamp(-5) },
    { id: 11, name: 'Orçamento - portão (aprovado)', type: 'ORCAMENTO', url: sample, relatedType: 'BUDGET', relatedId: 2, createdAt: offsetStamp(-30) }
  ];
}

function directReceipts(month: string) {
  return month === thisMonth()
    ? [{ day: 12, description: 'Locação do salão de festas', amount: 180 }]
    : month === shiftMonth(thisMonth(), -1)
      ? [{ day: 14, description: 'Locação do salão de festas', amount: 150 }]
      : [];
}

// ---- Dashboard and monthly report ------------------------------------------------------------------------------

function monthExpenses(month: string) {
  return expenses().filter((expense) => String(expense.expenseDate).startsWith(month));
}

function monthIncome(month: string) {
  const paid = contributions(month).filter((item) => item.status === 'PAID').reduce((sum, item) => sum + (item.paidAmount ?? 0), 0);
  const direct = directReceipts(month).reduce((sum, receipt) => sum + receipt.amount, 0);
  return { paid, direct, total: paid + direct };
}

function balanceUntil(month: string) {
  const current = thisMonth();
  return [shiftMonth(current, -1), current]
    .filter((item) => item <= month)
    .reduce((sum, item) => sum + monthIncome(item).total - monthExpenses(item).reduce((acc, expense) => acc + expense.amount, 0), OPENING_BALANCE);
}

function movements(month: string): Movement[] {
  const list: Movement[] = [];
  contributions(month).filter((item) => item.status === 'PAID').forEach((item) => list.push({
    date: String(item.paymentDate).slice(0, 10),
    type: item.manualPayment ? 'PAGAMENTO_MANUAL' : 'PIX_ASAAS',
    description: `Contribuição - ${item.houseLabel}`,
    amount: MONTHLY_AMOUNT,
    status: 'PAID'
  }));
  directReceipts(month).forEach((receipt) => list.push({
    date: dayOf(month, receipt.day),
    type: 'RECEBIMENTO_DIRETO',
    description: receipt.description,
    amount: receipt.amount,
    status: 'PAID'
  }));
  monthExpenses(month).forEach((expense) => list.push({
    date: String(expense.expenseDate),
    type: 'DESPESA',
    description: expense.description,
    amount: -expense.amount,
    status: 'PAID'
  }));
  return list.sort((a, b) => b.date.localeCompare(a.date));
}

export function dashboard(month: string): Dashboard {
  const rows = contributions(month);
  const income = monthIncome(month);
  const open = rows.filter((item) => item.status !== 'PAID');
  return {
    month,
    balance: balanceUntil(month),
    collected: income.paid,
    totalCollected: income.total,
    pending: rows.filter((item) => item.status === 'PENDING').length * MONTHLY_AMOUNT,
    overdue: rows.filter((item) => item.status === 'OVERDUE').length * MONTHLY_AMOUNT,
    expenses: monthExpenses(month).reduce((sum, expense) => sum + expense.amount, 0),
    paidHouses: rows.length - open.length,
    pendingHouses: open.length,
    transparencyEnabled: true,
    movements: movements(month)
  };
}

export function monthlyReport(month: string): MonthlyReport {
  const income = monthIncome(month);
  const spent = monthExpenses(month);
  const totalExpenses = spent.reduce((sum, expense) => sum + expense.amount, 0);
  const byCategory = new Map<string, { amount: number; count: number }>();
  spent.forEach((expense) => {
    const entry = byCategory.get(expense.category ?? 'Outros') ?? { amount: 0, count: 0 };
    byCategory.set(expense.category ?? 'Outros', { amount: entry.amount + expense.amount, count: entry.count + 1 });
  });
  const paidCount = contributions(month).filter((item) => item.status === 'PAID').length;
  return {
    month,
    transparencyEnabled: true,
    openingBalance: balanceUntil(shiftMonth(month, -1)),
    totalIncome: income.total,
    totalExpenses,
    closingBalance: balanceUntil(month),
    incomeBySource: [
      { label: 'Contribuições via Pix', amount: income.paid, count: paidCount },
      ...(income.direct ? [{ label: 'Recebimentos diretos', amount: income.direct, count: directReceipts(month).length }] : [])
    ],
    expensesByCategory: [...byCategory.entries()].map(([label, value]) => ({ label, amount: value.amount, count: value.count })),
    incomes: movements(month).filter((item) => item.type !== 'DESPESA').map((item) => ({
      date: item.date,
      source: item.type === 'RECEBIMENTO_DIRETO' ? 'Recebimento direto' : 'Contribuição',
      description: item.description,
      amount: item.amount
    })),
    expenses: spent.map((expense) => ({
      id: expense.id as number,
      date: String(expense.expenseDate),
      description: expense.description,
      category: expense.category ?? 'Outros',
      supplier: expense.supplier,
      amount: expense.amount,
      hasDocument: Boolean(expense.documentId),
      voted: expense.budgetId ? true : undefined
    })),
    expensesWithoutDocument: spent.filter((expense) => !expense.documentId).length,
    unvotedTotal: 0,
    unvotedCount: 0
  };
}

export function reconciliation(): Reconciliation {
  const balance = balanceUntil(thisMonth());
  return {
    portalBalance: balance,
    asaasBalance: balance,
    difference: 0,
    checkedAt: new Date().toISOString(),
    message: 'Saldo conferido com o banco (dados de exemplo).'
  };
}

// ---- Services, budgets, votes, reports -------------------------------------------------------------------------

export function services(): ServiceOrder[] {
  return [
    {
      id: 1,
      title: 'Conserto do portão da garagem',
      description: 'O portão não fechava até o fim. Troca do motor e ajuste dos trilhos.',
      category: 'Manutenção',
      priority: 'ALTA',
      status: 'FINALIZADO',
      expectedValue: 1800,
      finalValue: 1850,
      supplier: 'Serralheria Exemplo Ltda',
      plannedDate: offsetDay(-25),
      completedDate: offsetDay(-20),
      approvedBudgetId: 2,
      problemReportId: 1,
      notes: 'Serviço de exemplo, já pago e com nota anexada.'
    },
    {
      id: 2,
      title: 'Pintura da fachada',
      description: 'Pintura externa do prédio e dos muros. Há duas propostas esperando o voto das casas.',
      category: 'Manutenção',
      priority: 'MEDIA',
      status: 'PLANEJADO',
      expectedValue: 7000,
      plannedDate: offsetDay(30)
    },
    {
      id: 3,
      title: 'Troca das lâmpadas do corredor por LED',
      description: 'Troca de 12 lâmpadas do corredor do bloco B por LED, com menos gasto de energia.',
      category: 'Energia',
      priority: 'BAIXA',
      status: 'EM_ANDAMENTO',
      expectedValue: 980,
      supplier: 'Elétrica Exemplo',
      plannedDate: offsetDay(3),
      approvedBudgetId: 5,
      problemReportId: 2
    }
  ];
}

export function budgets(): Budget[] {
  return [
    { id: 1, serviceId: 1, title: 'Portão - proposta A', supplier: 'Portões Exemplo ME', amount: 2100, budgetDate: offsetDay(-34), status: 'REJEITADO', scope: 'Troca do motor e dos trilhos.', competes: true },
    { id: 2, serviceId: 1, title: 'Portão - proposta B', supplier: 'Serralheria Exemplo Ltda', phone: '(11) 90000-0101', amount: 1850, budgetDate: offsetDay(-33), status: 'APROVADO', documentId: 11, scope: 'Motor novo, ajuste dos trilhos e mão de obra.', votingClosedAt: offsetStamp(-28), problemReportId: 1, competes: true },
    { id: 3, serviceId: 2, title: 'Pintura da fachada - opção 1', supplier: 'Pinturas Exemplo Ltda', phone: '(11) 90000-0102', amount: 7400, budgetDate: offsetDay(-6), validUntil: offsetDay(20), status: 'EM_ANALISE', documentId: 9, scope: 'Tinta acrílica premium, duas demãos, andaime incluso.', votingDeadline: offsetStamp(5), competes: true },
    { id: 4, serviceId: 2, title: 'Pintura da fachada - opção 2', supplier: 'Cores & Cia Exemplo', phone: '(11) 90000-0103', amount: 6900, budgetDate: offsetDay(-5), validUntil: offsetDay(20), status: 'EM_ANALISE', documentId: 10, scope: 'Tinta acrílica padrão, duas demãos, andaime incluso.', votingDeadline: offsetStamp(5), competes: true },
    { id: 5, serviceId: 3, title: 'Lâmpadas LED do corredor', supplier: 'Elétrica Exemplo', amount: 980, budgetDate: offsetDay(-12), status: 'APROVADO', scope: '12 lâmpadas LED e instalação.', votingClosedAt: offsetStamp(-8), problemReportId: 2, competes: false }
  ];
}

const VOTING_STATE: Record<number, { approve: number; reject: number }> = { 2: { approve: 8, reject: 1 }, 3: { approve: 3, reject: 1 }, 4: { approve: 2, reject: 1 }, 5: { approve: 7, reject: 0 }, 1: { approve: 1, reject: 7 } };

export function budgetVoting(id: number, role: string, myVote: 'APROVAR' | 'RECUSAR' | null): BudgetVoting | null {
  const budget = budgets().find((item) => item.id === id);
  if (!budget) {
    return null;
  }
  const open = budget.status === 'EM_ANALISE';
  const counts = VOTING_STATE[id] ?? { approve: 0, reject: 0 };
  const approve = counts.approve + (myVote === 'APROVAR' ? 1 : 0);
  const reject = counts.reject + (myVote === 'RECUSAR' ? 1 : 0);
  const isResident = role === 'RESIDENT';
  return {
    budgetId: id,
    status: budget.status,
    open,
    participatingHouses: OCCUPIED_HOUSES,
    votesToApprove: 6,
    approveVotes: approve,
    rejectVotes: reject,
    pendingVotes: Math.max(0, OCCUPIED_HOUSES - approve - reject),
    myVote,
    canVote: open && isResident && !myVote,
    cannotVoteReason: !open ? 'A votação deste orçamento já terminou.' : !isResident ? 'Só as casas votam. Entre como morador para votar.' : myVote ? 'Você já votou neste orçamento.' : null,
    closedAt: budget.votingClosedAt ?? null,
    deadline: budget.votingDeadline ?? null,
    // House 1 is the resident of the demonstration: it only counts as voted after the demonstration resident votes.
    houses: Array.from({ length: OCCUPIED_HOUSES }, (_, index) => ({
      houseId: index + 1,
      houseLabel: houseLabel(index + 1),
      voted: index === 0 ? myVote != null : index - 1 < counts.approve + counts.reject
    }))
  };
}

export function problemReports(): ProblemReport[] {
  return [
    { id: 1, title: 'Portão da garagem não fecha', location: 'Garagem', category: 'Manutenção', priority: 'ALTA', status: 'RESOLVIDO', description: 'O portão para antes de fechar e fica aberto à noite.', serviceId: 1, photoCount: 0, residentId: 3, houseId: 3, createdAt: offsetStamp(-40), updatedAt: offsetStamp(-20) },
    { id: 2, title: 'Lâmpadas queimadas no corredor do bloco B', location: 'Corredor', category: 'Elétrica', priority: 'MEDIA', status: 'EM_ANALISE', description: 'Três lâmpadas do corredor estão queimadas e o local fica escuro à noite.', serviceId: 3, photoCount: 0, residentId: 1, houseId: 1, createdAt: offsetStamp(-15), updatedAt: offsetStamp(-8) },
    { id: 3, title: 'Torneira do jardim pingando', location: 'Jardim', category: 'Hidráulica', priority: 'BAIXA', status: 'ABERTO', description: 'A torneira perto da entrada pinga o dia todo.', photoCount: 0, residentId: 5, houseId: 5, createdAt: offsetStamp(-2), updatedAt: offsetStamp(-2) }
  ];
}

export function problemEvents(reportId: number): ProblemReportEvent[] {
  const report = problemReports().find((item) => item.id === reportId);
  if (!report) {
    return [];
  }
  const events: ProblemReportEvent[] = [
    { id: reportId * 10 + 1, reportId, kind: 'CREATED', author: houseLabel(report.houseId ?? 1), message: 'Relato criado.', createdAt: report.createdAt as string }
  ];
  if (report.status !== 'ABERTO') {
    events.push({ id: reportId * 10 + 2, reportId, kind: 'STATUS', author: 'Administração', message: 'Situação alterada para Em análise.', createdAt: offsetStamp(-10) });
    events.push({ id: reportId * 10 + 3, reportId, kind: 'COMMENT', author: 'Administração', message: 'Já pedimos orçamentos para resolver.', createdAt: offsetStamp(-9) });
  }
  if (report.status === 'RESOLVIDO') {
    events.push({ id: reportId * 10 + 4, reportId, kind: 'STATUS', author: 'Administração', message: 'Relato resolvido: serviço finalizado.', createdAt: report.updatedAt as string });
  }
  return events;
}

// ---- Admin extras ----------------------------------------------------------------------------------------------

export function auditLog(): AuditEntry[] {
  const actor = 'admin@exemplo.invalid';
  const entry = (id: number, action: string, summary: string, days: number, entityType: string): AuditEntry => ({
    id, actorEmail: actor, actorRole: 'ADMIN', action, entityType, entityId: id, summary, createdAt: offsetStamp(days)
  });
  return [
    entry(6, 'INVITE_CREATED', 'Convite criado para a Casa 11 (exemplo).', -2, 'INVITE'),
    entry(5, 'BUDGET_CREATED', 'Orçamento "Pintura da fachada - opção 2" cadastrado (exemplo).', -5, 'BUDGET'),
    entry(4, 'BUDGET_CREATED', 'Orçamento "Pintura da fachada - opção 1" cadastrado (exemplo).', -6, 'BUDGET'),
    entry(3, 'SERVICE_FINISHED', 'Serviço "Conserto do portão da garagem" finalizado (exemplo).', -20, 'SERVICE'),
    entry(2, 'EXPENSE_CREATED', 'Despesa "Conserto do portão da garagem" lançada (exemplo).', -19, 'EXPENSE'),
    entry(1, 'MANUAL_PAYMENT', 'Pagamento da Casa 07 marcado como pago (exemplo).', -4, 'CONTRIBUTION')
  ];
}

export function webhookEvents(): WebhookEvent[] {
  return [
    { id: 2, eventType: 'PAYMENT_RECEIVED', gatewayPaymentId: 'pay_demo_1', payloadJson: '{"demo":true,"event":"PAYMENT_RECEIVED"}', processed: true, processedAt: offsetStamp(-3), createdAt: offsetStamp(-3) },
    { id: 1, eventType: 'PAYMENT_CREATED', gatewayPaymentId: 'pay_demo_2', payloadJson: '{"demo":true,"event":"PAYMENT_CREATED"}', processed: true, processedAt: offsetStamp(-10), createdAt: offsetStamp(-10) }
  ];
}
