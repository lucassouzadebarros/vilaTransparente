export type Role = 'ADMIN' | 'SINDICO' | 'RESIDENT';

export type ReportLine = { label: string; amount: number; count: number };

export type ReportIncome = { date: string; source: string; description: string; amount: number };

export type ReportExpense = {
  id: number;
  date: string;
  description: string;
  category: string;
  supplier?: string | null;
  amount: number;
  hasDocument: boolean;
  voted?: boolean;
  exceptionReason?: string | null;
};

export type MonthlyReport = {
  month: string;
  transparencyEnabled: boolean;
  openingBalance: number;
  totalIncome: number;
  totalExpenses: number;
  closingBalance: number;
  incomeBySource: ReportLine[];
  expensesByCategory: ReportLine[];
  incomes: ReportIncome[];
  expenses: ReportExpense[];
  expensesWithoutDocument: number;
  unvotedTotal?: number;
  unvotedCount?: number;
};

export type Reconciliation = {
  portalBalance: number;
  asaasBalance?: number | null;
  difference?: number | null;
  checkedAt: string;
  message: string;
};

export type AuditEntry = {
  id: number;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  summary?: string | null;
  createdAt: string;
};

export type Sindico = {
  residentId?: number | null;
  name?: string | null;
  houseId?: number | null;
  houseLabel?: string | null;
};

export type Session = {
  token: string;
  name: string;
  email: string;
  role: Role;
  residentId?: number | null;
  mustChangePassword?: boolean;
};

export type PasswordResetResponse = {
  message: string;
  debugCode?: string | null;
};

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

export type Movement = {
  date: string;
  type: string;
  description: string;
  amount: number;
  status: string;
};

export type Contribution = {
  id: number;
  houseId: number;
  houseLabel: string;
  residentId?: number;
  residentName?: string;
  month: string;
  amount: number;
  paidAmount?: number;
  status: string;
  paymentDate?: string;
  manualPayment: boolean;
  pixChargeId?: number;
};

export type PixCharge = {
  id: number;
  contributionId: number;
  houseId: number;
  houseLabel: string;
  residentName?: string;
  month: string;
  gateway: string;
  gatewayPaymentId: string;
  externalReference: string;
  value: number;
  dueDate: string;
  status: string;
  qrCodeBase64?: string;
  pixCopyPaste?: string;
  invoiceUrl?: string;
  receiptUrl?: string;
  paidAt?: string;
};

export type Expense = {
  id?: number;
  description: string;
  category?: string;
  amount: number;
  expenseDate: string;
  supplier?: string;
  paymentMethod?: string;
  notes?: string;
  documentId?: number;
  serviceOrderId?: number;
  budgetId?: number;
  exceptionReason?: string | null;
};

export type ServiceOrder = {
  id?: number;
  title: string;
  description: string;
  category?: string;
  priority: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
  status: 'PLANEJADO' | 'APROVADO' | 'EM_ANDAMENTO' | 'FINALIZADO' | 'CANCELADO';
  expectedValue?: number;
  finalValue?: number;
  supplier?: string;
  supplierDocument?: string;
  plannedDate?: string;
  completedDate?: string;
  approvedBudgetId?: number | null;
  problemReportId?: number | null;
  emergencyReason?: string | null;
  notes?: string;
};

export type Budget = {
  id?: number;
  serviceId?: number | null;
  title: string;
  supplier: string;
  supplierDocument?: string;
  phone?: string;
  amount: number;
  budgetDate?: string;
  validUntil?: string;
  expectedDate?: string;
  status: 'EM_ANALISE' | 'APROVADO' | 'REJEITADO' | 'CANCELADO';
  documentId?: number;
  scope?: string;
  notes?: string;
  votingClosedAt?: string | null;
  votingDeadline?: string | null;
  problemReportId?: number | null;
  competes?: boolean;
};

export type BudgetVoteChoice = 'APROVAR' | 'RECUSAR';

export type BudgetVoteHouse = {
  houseId: number;
  houseLabel: string;
  voted: boolean;
};

export type BudgetVoting = {
  budgetId: number;
  status: Budget['status'];
  open: boolean;
  participatingHouses: number;
  votesToApprove: number;
  approveVotes: number;
  rejectVotes: number;
  pendingVotes: number;
  myVote?: BudgetVoteChoice | null;
  canVote: boolean;
  cannotVoteReason?: string | null;
  closedAt?: string | null;
  houses: BudgetVoteHouse[];
  deadline?: string | null;
};

export type ProblemReport = {
  id?: number;
  title: string;
  location: string;
  category: string;
  priority: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
  status: 'ABERTO' | 'EM_ANALISE' | 'RESOLVIDO' | 'CANCELADO';
  description: string;
  attachmentName?: string | null;
  serviceId?: number | null;
  photoCount?: number;
  residentId?: number | null;
  houseId?: number | null;
  createdBy?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PortalDocument = {
  id?: number;
  name: string;
  type: string;
  url: string;
  relatedType?: string;
  relatedId?: number;
  description?: string;
  createdAt?: string;
};

export type Resident = {
  id?: number;
  houseId: number;
  name: string;
  email: string;
  phone?: string;
  documentMasked?: string;
  documentNumber?: string;
  documentRegistered?: boolean;
  gatewayCustomerId?: string | null;
  /** Only present in the answer to "create resident": the first-access password, shown once to the admin. */
  temporaryPassword?: string;
  status: string;
};

/** For the administration: a house, whether it still has nobody in it, and whether it has an open invite. */
export type RegistrationHouseOption = {
  houseId: number;
  number: number;
  label: string;
  available: boolean;
  invited: boolean;
};

/** The answer to "which house does this code open?": nothing else about the invite is revealed. */
export type InviteCheck = {
  houseLabel: string;
  houseNumber: number;
};

/** Only in the answer that creates the invite: the code is not kept in a readable form. */
export type InviteIssued = {
  id: number;
  houseId: number;
  houseNumber: number;
  houseLabel: string;
  code: string;
  expiresAt: string;
};

export type Invite = {
  id: number;
  houseId: number;
  houseNumber: number | null;
  houseLabel: string;
  createdAt: string;
  expiresAt: string;
  createdBy?: string | null;
};

export type ResidentRegistration = {
  code: string;
  name: string;
  email: string;
  phone: string;
  documentNumber: string;
  password: string;
};

export type ResidentRegistrationResponse = {
  residentId: number;
  houseId: number;
  houseNumber: number;
  houseLabel: string;
  name: string;
  email: string;
  gatewayCustomerId: string;
};

export type WebhookEvent = {
  id: number;
  eventType: string;
  gatewayPaymentId?: string;
  payloadJson: string;
  processed: boolean;
  processedAt?: string;
  errorMessage?: string;
  createdAt: string;
};

export type ProblemReportEvent = {
  id: number;
  reportId: number;
  kind: 'CREATED' | 'STATUS' | 'SERVICE' | 'COMMENT';
  author?: string | null;
  message: string;
  createdAt: string;
};
