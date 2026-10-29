const BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api').replace(/\/$/, '');
const TOKEN_KEY = 'vila-plataforma-sessao';

export type LoginResponse = {
  token: string;
  name: string;
  email: string;
  role: string;
};

export type PlatformMe = {
  name: string;
  email: string;
};

export type Session = {
  name: string;
  email: string;
  role: 'ADMIN' | 'SINDICO' | 'RESIDENT' | string;
  residentId: number | null;
  platformAdmin: boolean;
  condominium: { id: number; name: string; slug: string; status: string; pixConnected: boolean } | null;
  /** May record, approve and pay the condominium's bills: the administration, and the síndico when allowed. */
  canPay: boolean;
};

/** Who may use the panel: the platform's owners, whoever administers a condominium and its síndico. Residents use the app. */
export function mayUsePanel(session: Session) {
  return session.platformAdmin || session.role === 'ADMIN' || session.role === 'SINDICO';
}

export function administersCondominium(session: Session) {
  return session.role === 'ADMIN' && session.condominium !== null;
}

/** The administration and the síndico: they follow the bills (and pay them, when canPay). */
export function managesCondominium(session: Session) {
  return (session.role === 'ADMIN' || session.role === 'SINDICO') && session.condominium !== null;
}

export type PixKeyType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

export type Supplier = {
  id: number;
  name: string;
  document: string | null;
  pixKey: string | null;
  pixKeyType: PixKeyType | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
};

export type SupplierInput = Omit<Supplier, 'id' | 'active'>;

export type PayableStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'PAID' | 'CANCELLED';

export type Payable = {
  id: number;
  description: string;
  category: string | null;
  amount: number;
  dueDate: string;
  status: PayableStatus;
  overdue: boolean;
  supplierId: number | null;
  supplierName: string | null;
  supplierHasPix: boolean;
  installment: number | null;
  installments: number | null;
  recurrence: 'MONTHLY' | null;
  budgetId: number | null;
  serviceOrderId: number | null;
  documentId: number | null;
  exceptionReason: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  paidBy: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  receiptDocumentId: number | null;
  expenseId: number | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  canApprove: boolean;
  /** The last Pix sent for it through Asaas; null when none was. */
  pixStatus: PixStatus | null;
  pixFailReason: string | null;
  /** KEY: to the supplier's key; CODE: a "copia e cola" code (supplierName is then who the code pays). */
  pixKind: 'KEY' | 'CODE' | null;
};

/** AWAITING_AUTHORIZATION: Asaas holds it until someone types the account's token (SMS or app). */
export type PixStatus = 'REQUESTED' | 'PENDING' | 'AWAITING_AUTHORIZATION' | 'BANK_PROCESSING' | 'DONE' | 'FAILED' | 'CANCELLED';
/** Still on its way: the bill is settled by itself when Asaas confirms it. */
export const PIX_IN_FLIGHT: PixStatus[] = ['REQUESTED', 'PENDING', 'AWAITING_AUTHORIZATION', 'BANK_PROCESSING'];

/** A "copia e cola" code as Asaas read it. valueFixed: it can only be paid with value. expiresAt: "2026-10-30 11:00:00". */
export type PixCode = {
  receiverName: string | null;
  receiverDocument: string | null;
  bank: string | null;
  value: number | null;
  valueFixed: boolean;
  expiresAt: string | null;
  description: string | null;
  canBePaid: boolean;
  reason: string | null;
};

export type PayPixCodeInput = {
  code: string;
  amount: number | null;
  description: string;
  category: string | null;
  serviceOrderId: number | null;
  exceptionReason: string | null;
  notes: string | null;
  password: string;
};

export type PixPaymentStatus = { available: boolean; reason: string | null; dailyLimit: number | null; usedToday: number; balance: number | null };

/** What the administration types in Asaas (Integrações > Mecanismos de segurança) so each withdrawal is checked here. */
export type PixValidation = { configured: boolean; url: string | null; token: string | null; lastCheckAt: string | null };

/**
 * A new bill: amount is the whole of it. With downPayment, that part falls due on dueDate and the rest, in installments
 * parts, from restDueDate. A bill for a service counts, with the others of the service, against what was approved.
 */
export type PayableInput = {
  supplierId: number | null;
  description: string;
  category: string | null;
  amount: number;
  dueDate: string;
  installments: number;
  monthly: boolean;
  budgetId: number | null;
  serviceOrderId: number | null;
  downPayment: number | null;
  restDueDate: string | null;
  documentId: number | null;
  exceptionReason: string | null;
  notes: string | null;
};

export type PaymentMethod = 'PIX' | 'TED' | 'BOLETO' | 'DINHEIRO' | 'CARTAO' | 'OUTRO';

export type BudgetOption = { id: number; title: string; supplier: string; amount: number; status: string };

export type Priority = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';

export type ProblemReport = {
  id: number;
  title: string;
  location: string;
  category: string;
  priority: Priority;
  status: 'ABERTO' | 'EM_ANALISE' | 'RESOLVIDO' | 'CANCELADO';
  description: string;
  attachmentName: string | null;
  serviceId: number | null;
  photoCount: number | null;
  residentId: number | null;
  houseId: number | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ProblemEvent = { id: number; reportId: number; kind: 'CREATED' | 'STATUS' | 'SERVICE' | 'COMMENT'; author: string | null; message: string; createdAt: string };

export type ServiceOrder = {
  id: number;
  title: string;
  description: string;
  category: string | null;
  priority: Priority;
  status: 'PLANEJADO' | 'APROVADO' | 'EM_ANDAMENTO' | 'FINALIZADO' | 'CANCELADO';
  expectedValue: number | null;
  finalValue: number | null;
  supplier: string | null;
  supplierDocument: string | null;
  plannedDate: string | null;
  completedDate: string | null;
  approvedBudgetId: number | null;
  problemReportId: number | null;
  emergencyReason: string | null;
  notes: string | null;
  createdAt: string;
};

export type Budget = {
  id: number;
  serviceId: number | null;
  problemReportId: number | null;
  competes: boolean;
  title: string;
  supplier: string;
  supplierDocument: string | null;
  phone: string | null;
  amount: number;
  budgetDate: string | null;
  validUntil: string | null;
  expectedDate: string | null;
  status: 'EM_ANALISE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
  documentId: number | null;
  scope: string | null;
  notes: string | null;
  votingClosedAt: string | null;
  votingDeadline: string | null;
  createdAt: string;
} & PaymentTerms;

/**
 * How the supplier will be paid, as the units vote it: A_VISTA, PARCELADO (paymentInstallments equal parts) or ENTRADA
 * (downPayment, then the rest in paymentInstallments parts). Empty on budgets that did not say.
 */
export type PaymentMode = 'A_VISTA' | 'PARCELADO' | 'ENTRADA';
export type PaymentTerms = { paymentMode: PaymentMode | null; downPayment: number | null; paymentInstallments: number | null };

export type BudgetVoting = {
  budgetId: number;
  status: Budget['status'];
  open: boolean;
  participatingHouses: number;
  votesToApprove: number;
  approveVotes: number;
  rejectVotes: number;
  pendingVotes: number;
  closedAt: string | null;
  deadline: string | null;
  houses: { houseId: number; houseLabel: string; voted: boolean }[];
};

export type ProblemInput = { title: string; location: string; category: string; priority: Priority; description: string };

/** A budget as the forms send it. The problem it is for and whether it competes are set once, when it is created. */
export type BudgetInput = {
  title: string;
  supplier: string;
  supplierDocument: string | null;
  phone: string | null;
  amount: number;
  budgetDate: string | null;
  validUntil: string | null;
  expectedDate: string | null;
  votingDeadline: string | null;
  scope: string | null;
  notes: string | null;
  documentId: number | null;
  problemReportId?: number | null;
  competes?: boolean;
} & PaymentTerms;

/** A service as the forms send it. Finishing and cancelling have their own actions, so the status here is only an open one. */
export type ServiceInput = {
  title: string;
  description: string;
  category: string | null;
  priority: Priority;
  status: 'PLANEJADO' | 'EM_ANDAMENTO';
  expectedValue: number | null;
  supplier: string | null;
  supplierDocument: string | null;
  plannedDate: string | null;
  approvedBudgetId: number | null;
  problemReportId?: number | null;
  notes: string | null;
};

export type FinishServiceInput = {
  finalValue: number;
  completedDate: string;
  supplier: string;
  supplierDocument: string | null;
  documentId: number | null;
  generateExpense: boolean;
  notes: string | null;
  emergencyReason: string | null;
};

export type DocumentKind = 'NOTA_FISCAL' | 'RECIBO' | 'BOLETO' | 'ORCAMENTO' | 'CONTRATO' | 'COMPROVANTE';

export type PortalDocument = { id: number; name: string; type: string; url: string; relatedType: string | null; relatedId: number | null; description: string | null; createdAt: string };

export type ExpenseRecord = {
  id: number;
  description: string;
  category: string | null;
  amount: number;
  expenseDate: string;
  supplier: string | null;
  paymentMethod: string | null;
  documentId: number | null;
  serviceOrderId: number | null;
  budgetId: number | null;
  exceptionReason: string | null;
};

export type UploadedDocument = { id: number; name: string; url: string };

export type Movement = { date: string; type: string; description: string; amount: number; status: string };

export type Dashboard = {
  month: string;
  balance: number;
  collected: number;
  totalCollected: number;
  pending: number;
  overdue: number;
  expenses: number;
  paidHouses: number;
  pendingHouses: number;
  transparencyEnabled: boolean;
  movements: Movement[];
};

export type HouseOption = { houseId: number; number: number; label: string; available: boolean; invited: boolean };

export type Resident = { id: number; houseId: number; name: string; email: string | null; phone: string | null; status: string; createdAt: string };

export type OpenInvite = { id: number; houseId: number; houseNumber: number; houseLabel: string; createdAt: string; expiresAt: string; createdBy: string };

export type IssuedInvite = { id: number; houseId: number; houseNumber: number; houseLabel: string; code: string; expiresAt: string };

/** PIX, or BOLETO: a boleto that also carries a Pix QR code. */
export type BillingType = 'PIX' | 'BOLETO';

export type CondominiumSettings = {
  id: number;
  villageName: string;
  monthlyAmount: number;
  paymentDueDay: number;
  gatewayProvider: string;
  budgetRequiredAbove: number | null;
  billingType: BillingType;
  finePercent: number;
  interestPercent: number;
  chargeTitle: string;
  reserveFundPercent: number;
  remindersEnabled: boolean;
  reminderDaysBefore: number;
  /** FIXED: the same value for every unit. FRACTION: monthlyTotal divided by each unit's ideal fraction. */
  chargeMode: ChargeMode;
  monthlyTotal: number | null;
  waterPrice: number | null;
  gasPrice: number | null;
  sindicoCanPay: boolean;
  approvalAbove: number | null;
  /** Most that may leave by Pix in a day; null turns paying bills by Pix off. */
  pixDailyLimit: number | null;
};

export type ChargeMode = 'FIXED' | 'FRACTION';

export type BillingRules = Pick<
  CondominiumSettings,
  'billingType' | 'finePercent' | 'interestPercent' | 'chargeTitle' | 'reserveFundPercent' | 'remindersEnabled' | 'reminderDaysBefore' | 'chargeMode' | 'monthlyTotal'
>;

/** share: percent of the condominium; amount: what the unit pays of the month's total. */
export type UnitFraction = { houseId: number; houseLabel: string; hasResident: boolean; fraction: number | null; share: number | null; amount: number | null };

export type FractionsView = { monthlyTotal: number | null; sum: number; units: UnitFraction[] };

export type MeterKind = 'WATER' | 'GAS';

/** previousFromHistory: the reading before is last month's (fixed). chargeStatus: empty while it can still be corrected. */
export type ReadingRow = {
  houseId: number;
  houseLabel: string;
  residentName: string | null;
  previousReading: number | null;
  previousFromHistory: boolean;
  reading: number | null;
  consumption: number | null;
  amount: number | null;
  contributionId: number | null;
  chargeStatus: string | null;
};

export type ReadingsView = { month: string; kind: MeterKind; unitPrice: number | null; totalConsumption: number; totalAmount: number; rows: ReadingRow[] };

export type ReadingInput = { houseId: number; previousReading: number | null; reading: number | null };

/** NOT_CHARGED: a resident, no charge yet this month. NO_RESIDENT: nobody to charge. */
export type BillingStatus = 'PAID' | 'PENDING' | 'OVERDUE' | 'CANCELLED' | 'NOT_CHARGED' | 'NO_RESIDENT';

export type BillingRow = {
  houseId: number;
  houseLabel: string;
  residentName: string | null;
  contributionId: number | null;
  chargeId: number | null;
  amount: number | null;
  paidAmount: number | null;
  dueDate: string | null;
  status: BillingStatus;
  extra: boolean;
  manual: boolean;
  invoiceUrl: string | null;
  receiptUrl: string | null;
  paidAt: string | null;
  /** What a one-off charge is for; empty on the monthly fee. */
  description: string | null;
  reserveAmount: number | null;
};

export type BillingMonth = {
  month: string;
  pixConnected: boolean;
  chargeMode: ChargeMode;
  monthlyTotal: number | null;
  monthlyAmount: number;
  dueDate: string;
  unitsToCharge: number;
  totals: { expected: number; received: number; open: number; overdue: number; reserve: number; paid: number; pending: number; late: number };
  rows: BillingRow[];
};

/** houseId empty: every unit with a resident. */
export type ExtraCharge = { houseId: number | null; description: string; amount: number; dueDate: string };

export type UnitProblem = { houseLabel: string; reason: string };

export type GenerateResult = { month: string; created: number; alreadyCharged: number; failed: UnitProblem[]; skipped: UnitProblem[] };

/** PAINEL: connected here with the condominium's own key. SERVIDOR: the key lives in the server's configuration (the Vila). */
export type PaymentsStatus = {
  connected: boolean;
  source: 'PAINEL' | 'SERVIDOR' | null;
  accountName: string | null;
  keyHint: string | null;
  connectedAt: string | null;
  lastEventAt: string | null;
};

export type CondominiumSummary = {
  id: number;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED' | string;
  createdAt: string;
  houses: number;
  activeResidents: number;
  pixConnected: boolean;
};

export type CondominiumActivity = {
  action: string;
  summary: string | null;
  actor: string | null;
  at: string;
};

export type PendingManager = { name: string; email: string; expiresAt: string };

export type CondominiumDetail = {
  condominium: CondominiumSummary;
  sindicoName: string | null;
  sindicoHouse: string | null;
  administrators: number;
  pendingManager: PendingManager | null;
  activity: CondominiumActivity[];
};

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type CondominiumRequest = {
  id: number;
  condominiumName: string;
  city: string;
  state: string;
  units: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  hasAsaas: 'SIM' | 'NAO' | 'NAO_SEI';
  message: string | null;
  status: RequestStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  condominiumId: number | null;
};

export type RequestForm = {
  condominiumName: string;
  city: string;
  state: string;
  units: number;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  hasAsaas: 'SIM' | 'NAO' | 'NAO_SEI';
  message: string;
  website: string;
};

export type ManagerInvitation = { name: string; email: string; code: string; expiresAt: string };

export type Approval = {
  name: string;
  slug: string;
  unitLabel: UnitLabel;
  units: number;
  managerName: string;
  managerEmail: string;
};

export type ActivationPreview = { condominiumName: string; name: string; email: string };

export type UnitLabel = 'Casa' | 'Apto' | 'Unidade' | 'Lote' | 'Sala';

export type NewCondominium = {
  name: string;
  slug: string;
  unitLabel: UnitLabel;
  units: number;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** The session lives in this tab only: closing the browser signs out. */
export function storedToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode without storage: the session simply does not survive a reload.
  }
}

let onSessionExpired: () => void = () => {};

export function whenSessionExpires(handler: () => void) {
  onSessionExpired = handler;
}

function fallbackMessage(status: number) {
  if (status === 401) return 'Sua sessão expirou. Entre de novo.';
  if (status === 403) return 'Esta conta não tem acesso a esta área.';
  if (status >= 500) return 'O servidor não respondeu como deveria. Tente de novo em instantes.';
  return 'Não foi possível concluir. Tente de novo.';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = storedToken();
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        // A file goes as a form, and the browser writes its own Content-Type with the boundary.
        ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers
      }
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor. Confira a internet e tente de novo.');
  }
  if (!response.ok) {
    let message: string | undefined;
    try {
      const body = await response.json();
      message = body?.error ?? body?.message;
    } catch {
      // No body, or not JSON.
    }
    if (response.status === 401 && token) onSessionExpired();
    throw new ApiError(response.status, message ?? fallbackMessage(response.status));
  }
  return response.json() as Promise<T>;
}

/**
 * Where a kept file can be opened: a short-lived signed address of this server, or the link itself when the file is
 * kept elsewhere (the receipt of a Pix sent through Asaas).
 */
async function documentAddress(id: number) {
  const access = await request<{ path?: string; url?: string }>(`/documents/${id}/access`);
  return access.url ?? `${BASE_URL.replace(/\/api$/, '')}${access.path}`;
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<PlatformMe>('/platform/me'),
  session: () => request<Session>('/session'),
  // The signed-in administrator's own condominium (the API answers inside it).
  dashboard: (month: string) => request<Dashboard>(`/dashboard?month=${month}`),
  houses: () => request<HouseOption[]>('/residents/houses'),
  residents: () => request<Resident[]>('/residents'),
  openInvites: () => request<OpenInvite[]>('/residents/invites'),
  createInvite: (houseId: number) => request<IssuedInvite>('/residents/invites', { method: 'POST', body: JSON.stringify({ houseId }) }),
  revokeInvite: (id: number) => request<{ status: string }>(`/residents/invites/${id}`, { method: 'DELETE' }),
  settings: () => request<CondominiumSettings>('/settings'),
  updateSettings: (settings: Pick<CondominiumSettings, 'villageName' | 'monthlyAmount' | 'paymentDueDay'>) =>
    request<CondominiumSettings>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  updateBudgetRule: (budgetRequiredAbove: number | null) =>
    request<CondominiumSettings>('/settings/budget-rule', { method: 'PUT', body: JSON.stringify({ budgetRequiredAbove }) }),
  updateBillingRules: (rules: BillingRules) => request<CondominiumSettings>('/settings/billing', { method: 'PUT', body: JSON.stringify(rules) }),
  billing: (month: string) => request<BillingMonth>(`/admin/billing?month=${month}`),
  generateCharges: (input: { month: string; amount?: number; total?: number; dueDate: string }) =>
    request<GenerateResult>('/admin/billing/generate', { method: 'POST', body: JSON.stringify(input) }),
  updatePaymentRules: (rules: { sindicoCanPay: boolean; approvalAbove: number | null; pixDailyLimit: number | null }) =>
    request<CondominiumSettings>('/settings/payments', { method: 'PUT', body: JSON.stringify(rules) }),
  pixStatus: () => request<PixPaymentStatus>('/payables/pix'),
  /** Sends the bill's Pix from the condominium's Asaas account; the person's own password confirms it. */
  payByPix: (id: number, password: string) => request<Payable>(`/payables/${id}/pix`, { method: 'POST', body: JSON.stringify({ password }) }),
  /** Asks Asaas what a "copia e cola" code is (who receives it, how much). Nothing is paid. */
  readPixCode: (code: string) => request<PixCode>('/payables/pix-code/read', { method: 'POST', body: JSON.stringify({ code }) }),
  /** Records the code's bill and pays it from the condominium's Asaas account; the person's own password confirms it. */
  payPixCode: (input: PayPixCodeInput) => request<Payable>('/payables/pix-code', { method: 'POST', body: JSON.stringify(input) }),
  pixValidation: () => request<PixValidation>('/payments/pix-validation'),
  createPixValidation: () => request<PixValidation>('/payments/pix-validation', { method: 'POST' }),
  suppliers: () => request<Supplier[]>('/suppliers'),
  saveSupplier: (id: number | null, input: SupplierInput) =>
    request<Supplier>(id == null ? '/suppliers' : `/suppliers/${id}`, { method: id == null ? 'POST' : 'PUT', body: JSON.stringify(input) }),
  deactivateSupplier: (id: number) => request<Supplier>(`/suppliers/${id}`, { method: 'DELETE' }),
  payables: () => request<Payable[]>('/payables'),
  createPayable: (input: PayableInput) => request<Payable[]>('/payables', { method: 'POST', body: JSON.stringify(input) }),
  approvePayable: (id: number) => request<Payable>(`/payables/${id}/approve`, { method: 'POST' }),
  payPayable: (id: number, input: { paidAt: string; method: PaymentMethod; receiptDocumentId: number | null; notes: string | null }) =>
    request<Payable>(`/payables/${id}/pay`, { method: 'POST', body: JSON.stringify(input) }),
  cancelPayable: (id: number, reason: string) => request<Payable>(`/payables/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  budgets: () => request<BudgetOption[]>('/budgets'),
  // Demands: problems the units report, the budgets voted on and the services done.
  problems: () => request<ProblemReport[]>('/problem-reports'),
  createProblem: (input: ProblemInput) => request<ProblemReport>('/problem-reports', { method: 'POST', body: JSON.stringify(input) }),
  addProblemPhoto: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return request<PortalDocument>(`/problem-reports/${id}/photos`, { method: 'POST', body: form });
  },
  problemEvents: (id: number) => request<ProblemEvent[]>(`/problem-reports/${id}/events`),
  commentProblem: (id: number, message: string) => request<ProblemEvent>(`/problem-reports/${id}/comments`, { method: 'POST', body: JSON.stringify({ message }) }),
  updateProblem: (report: ProblemReport) => request<ProblemReport>(`/problem-reports/${report.id}`, { method: 'PUT', body: JSON.stringify(report) }),
  cancelProblem: (id: number) => request<ProblemReport>(`/problem-reports/${id}/cancel`, { method: 'POST' }),
  fullBudgets: () => request<Budget[]>('/budgets'),
  budgetVotings: () => request<BudgetVoting[]>('/budgets/votes'),
  budgetVoting: (id: number) => request<BudgetVoting>(`/budgets/${id}/votes`),
  closeVoting: (id: number) => request<BudgetVoting>(`/budgets/${id}/close-voting`, { method: 'POST' }),
  cancelBudget: (id: number) => request<{ status: string }>(`/budgets/${id}`, { method: 'DELETE' }),
  createBudget: (input: BudgetInput) => request<Budget>('/budgets', { method: 'POST', body: JSON.stringify(input) }),
  updateBudget: (id: number, input: BudgetInput) => request<Budget>(`/budgets/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  services: () => request<ServiceOrder[]>('/services'),
  createService: (input: ServiceInput) => request<ServiceOrder>('/services', { method: 'POST', body: JSON.stringify(input) }),
  updateService: (id: number, input: ServiceInput) => request<ServiceOrder>(`/services/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  finishService: (id: number, input: FinishServiceInput) => request<ServiceOrder>(`/services/${id}/finish`, { method: 'POST', body: JSON.stringify(input) }),
  cancelService: (id: number) => request<{ status: string }>(`/services/${id}/cancel`, { method: 'POST' }),
  expenses: () => request<ExpenseRecord[]>('/expenses'),
  documents: (relatedType: string, relatedId: number) => request<PortalDocument[]>(`/documents?relatedType=${relatedType}&relatedId=${relatedId}`),
  /** A short-lived address a photo can be shown from: an <img> cannot send the login header. */
  documentImageUrl: async (id: number) => documentAddress(id),
  /**
   * A file kept with a bill (only who pays the bills may send it), a budget or a service (the administration and the
   * síndico). The name is what the lists show; it defaults to the file's own name.
   */
  uploadDocument: (file: File, type: DocumentKind, related: { type: 'PAYABLE' | 'BUDGET' | 'SERVICE'; id?: number; name?: string } = { type: 'PAYABLE' }) => {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('name', related.name?.trim() || file.name);
    form.append('type', type);
    form.append('relatedType', related.type);
    if (related.id != null) form.append('relatedId', String(related.id));
    return request<UploadedDocument>('/documents/upload', { method: 'POST', body: form });
  },
  /** Opens a kept file in a new tab: the API answers a short-lived signed address. */
  openDocument: async (id: number) => {
    // The tab opens on the click itself (a tab opened after waiting for the API would be blocked as a pop-up).
    const tab = window.open('', '_blank');
    try {
      const url = await documentAddress(id);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (error) {
      tab?.close();
      throw error;
    }
  },
  fractions: () => request<FractionsView>('/admin/billing/fractions'),
  updateFractions: (updates: { houseId: number; fraction: number | null }[]) =>
    request<FractionsView>('/admin/billing/fractions', { method: 'PUT', body: JSON.stringify(updates) }),
  readings: (month: string, kind: MeterKind) => request<ReadingsView>(`/admin/readings?month=${month}&kind=${kind}`),
  saveReadings: (month: string, kind: MeterKind, unitPrice: number, readings: ReadingInput[]) =>
    request<ReadingsView>(`/admin/readings?month=${month}&kind=${kind}`, { method: 'PUT', body: JSON.stringify({ unitPrice, readings }) }),
  chargeReadings: (month: string, kind: MeterKind, dueDate: string) =>
    request<GenerateResult>(`/admin/readings/charge?month=${month}&kind=${kind}`, { method: 'POST', body: JSON.stringify({ dueDate }) }),
  extraCharge: (input: ExtraCharge) => request<GenerateResult>('/admin/billing/extra', { method: 'POST', body: JSON.stringify(input) }),
  cancelCharge: (chargeId: number, reason: string) =>
    request<unknown>(`/admin/pix/charges/${chargeId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  reconcileCharges: (month: string) => request<unknown>(`/admin/pix/reconcile?month=${month}`, { method: 'POST' }),
  paymentsStatus: () => request<PaymentsStatus>('/payments/asaas'),
  connectAsaas: (apiKey: string) => request<PaymentsStatus>('/payments/asaas/connect', { method: 'POST', body: JSON.stringify({ apiKey }) }),
  disconnectAsaas: () => request<PaymentsStatus>('/payments/asaas', { method: 'DELETE' }),
  condominiums: () => request<CondominiumSummary[]>('/platform/condominiums'),
  condominium: (id: number) => request<CondominiumDetail>(`/platform/condominiums/${id}`),
  createCondominium: (input: NewCondominium) =>
    request<CondominiumSummary>('/platform/condominiums', { method: 'POST', body: JSON.stringify(input) }),
  renameCondominium: (id: number, name: string) =>
    request<CondominiumSummary>(`/platform/condominiums/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  setCondominiumStatus: (id: number, status: 'ACTIVE' | 'SUSPENDED') =>
    request<CondominiumSummary>(`/platform/condominiums/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  requests: (status: RequestStatus | 'ALL') => request<CondominiumRequest[]>(`/platform/requests?status=${status}`),
  pendingRequests: () => request<{ pending: number }>('/platform/requests/pending-count'),
  approveRequest: (id: number, approval: Approval) =>
    request<{ condominium: CondominiumSummary; manager: ManagerInvitation }>(`/platform/requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(approval)
    }),
  rejectRequest: (id: number, note: string) =>
    request<CondominiumRequest>(`/platform/requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
  inviteManager: (condominiumId: number, name: string, email: string) =>
    request<ManagerInvitation>(`/platform/condominiums/${condominiumId}/manager`, { method: 'POST', body: JSON.stringify({ name, email }) }),
  // Public: no account needed.
  submitRequest: (form: RequestForm) =>
    request<{ status: string }>('/public/condominium-requests', { method: 'POST', body: JSON.stringify(form) }),
  checkActivation: (code: string) =>
    request<ActivationPreview>('/public/activation/check', { method: 'POST', body: JSON.stringify({ code }) }),
  activate: (code: string, password: string) =>
    request<{ status: string; email: string }>('/public/activation/complete', { method: 'POST', body: JSON.stringify({ code, password }) })
};

/** Where residents and administrators use the app (the web version; the Android app is the same). */
export const RESIDENTS_APP_URL = 'https://portal-vila-app.onrender.com';
