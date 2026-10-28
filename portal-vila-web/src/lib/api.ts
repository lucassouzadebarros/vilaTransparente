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
};

/** Who may use the panel: the platform's owners and whoever administers a condominium. Residents use the app. */
export function mayUsePanel(session: Session) {
  return session.platformAdmin || session.role === 'ADMIN';
}

export function administersCondominium(session: Session) {
  return session.role === 'ADMIN' && session.condominium !== null;
}

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
};

export type BillingRules = Pick<
  CondominiumSettings,
  'billingType' | 'finePercent' | 'interestPercent' | 'chargeTitle' | 'reserveFundPercent' | 'remindersEnabled' | 'reminderDaysBefore'
>;

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
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
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
  generateCharges: (input: { month: string; amount: number; dueDate: string }) =>
    request<GenerateResult>('/admin/billing/generate', { method: 'POST', body: JSON.stringify(input) }),
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
