export type Role = 'ADMIN' | 'RESIDENT';

export type Session = {
  token: string;
  name: string;
  email: string;
  role: Role;
  residentId?: number | null;
};

export type Dashboard = {
  month: string;
  balance: number;
  collected: number;
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
  notes?: string;
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
  status: string;
};

export type RegistrationHouseOption = {
  houseId: number;
  number: number;
  label: string;
  available: boolean;
};

export type ResidentRegistration = {
  houseId: number;
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
