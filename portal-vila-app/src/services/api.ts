import axios, { AxiosAdapter } from 'axios';
import { Linking, Platform } from 'react-native';
import { demoAdapter } from '../demo/demoAdapter';
import { isDemoMode } from '../demo/demoMode';
import { PickedFile, toFormPart } from '../utils/filePicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuditEntry,
  MonthlyReport,
  Reconciliation,
  Budget,
  BudgetVoteChoice,
  BudgetVoting,
  Contribution,
  Dashboard,
  Expense,
  Invite,
  InviteCheck,
  InviteIssued,
  PasswordResetResponse,
  Payable,
  PayableInput,
  PayPixCodeInput,
  Supplier,
  PixCharge,
  PixCode,
  PixPaymentStatus,
  PortalDocument,
  ProblemReport,
  ProblemReportEvent,
  HouseOption,
  Resident,
  ResidentRegistration,
  ResidentRegistrationResponse,
  ServiceOrder,
  Session,
  Sindico,
  WebhookEvent
} from '../types';

const webOrigin = typeof window !== 'undefined' ? window.location?.origin : undefined;
const isLocalWeb = !!webOrigin && /\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(webOrigin);
const webBaseURL = isLocalWeb
  ? 'http://localhost:8080/api'
  : webOrigin
    ? `${webOrigin}/api`
    : 'http://localhost:8080/api';
const baseURL = process.env.EXPO_PUBLIC_API_URL ?? webBaseURL;
const publicBaseURL = baseURL.replace(/\/api\/?$/, '');

const networkAdapter = axios.getAdapter(axios.defaults.adapter);
// In the demonstration the network is not used: example data answers instead (src/demo).
const demoAwareAdapter: AxiosAdapter = (config) => (isDemoMode() ? demoAdapter(config) : networkAdapter(config));

export const apiClient = axios.create({ baseURL, timeout: 20000, adapter: demoAwareAdapter });

function appendFile(form: FormData, file: PickedFile) {
  if (file.file) {
    form.append('file', file.file, file.name);
  } else {
    form.append('file', toFormPart(file) as never);
  }
}

const publicRequestPaths = new Set([
  '/auth/login',
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
  '/residents/invite-check',
  '/residents/register-with-invite'
]);

function isPublicRequest(url?: string) {
  if (!url) {
    return false;
  }
  try {
    const path = url.startsWith('http') ? new URL(url).pathname.replace(/^\/api/, '') : url.split('?')[0];
    return publicRequestPaths.has(path);
  } catch {
    return false;
  }
}

apiClient.interceptors.request.use(async (config) => {
  if (isPublicRequest(config.url)) {
    delete config.headers.Authorization;
    return config;
  }
  const raw = await AsyncStorage.getItem('portal-vila-session');
  if (raw) {
    try {
      const session = JSON.parse(raw) as Session;
      if (session.token) {
        config.headers.Authorization = `Bearer ${session.token}`;
      }
    } catch {
      await AsyncStorage.removeItem('portal-vila-session');
    }
  }
  return config;
});

const authExpiredListeners = new Set<() => void>();

/**
 * Calls `listener` when the server turns the saved sign-in down (401). It is a plain list and not a `window` event
 * because a phone has no `window.addEventListener`: using it there closed the app as soon as it opened.
 * Returns the function that stops listening.
 */
export function onAuthExpired(listener: () => void) {
  authExpiredListeners.add(listener);
  return () => {
    authExpiredListeners.delete(listener);
  };
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await AsyncStorage.removeItem('portal-vila-session');
      authExpiredListeners.forEach((listener) => listener());
    }
    return Promise.reject(error);
  }
);

async function requestData<T>(request: Promise<{ data: T }>): Promise<T> {
  const response = await request;
  return response.data;
}

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (typeof data === 'string' && data.trim()) {
      return data;
    }
    if (data && typeof data === 'object') {
      const payload = data as { error?: string; message?: string };
      if (payload.error) {
        return payload.error;
      }
      if (payload.message) {
        return payload.message;
      }
    }
    if (error.response?.status === 401) {
      return 'Sessão inválida ou expirada. Entre novamente.';
    }
    if (error.response?.status === 403) {
      return 'Acesso negado. Entre com a conta admin.';
    }
    if (error.code === 'ECONNABORTED') {
      return 'A API demorou para responder. Tente novamente.';
    }
    if (error.message) {
      return `A API não respondeu: ${error.message}`;
    }
  }
  return fallback;
}

export const api = {
  async login(email: string, password: string): Promise<Session> {
    return requestData<Session>(apiClient.post('/auth/login', { email, password }));
  },
  requestPasswordReset: (email: string) =>
    requestData<PasswordResetResponse>(apiClient.post('/auth/password-reset/request', { email })),
  confirmPasswordReset: (email: string, code: string, password: string) =>
    requestData<PasswordResetResponse>(apiClient.post('/auth/password-reset/confirm', { email, code, password })),
  deleteAccount: (password: string) => requestData<{ status: string }>(apiClient.post('/auth/delete-account', { password })),
  eraseResident: (id: number) => requestData<Resident>(apiClient.post(`/admin/residents/${id}/erase`)),
  changePassword: (currentPassword: string, newPassword: string) =>
    requestData<PasswordResetResponse>(apiClient.post('/auth/change-password', { currentPassword, newPassword })),
  checkInvite: (code: string) => requestData<InviteCheck>(apiClient.post('/residents/invite-check', { code })),
  registerWithInvite: (registration: ResidentRegistration) =>
    requestData<ResidentRegistrationResponse>(apiClient.post('/residents/register-with-invite', registration)),
  houses: () => requestData<HouseOption[]>(apiClient.get('/residents/houses')),
  invites: () => requestData<Invite[]>(apiClient.get('/residents/invites')),
  createInvite: (houseId: number) => requestData<InviteIssued>(apiClient.post('/residents/invites', { houseId })),
  revokeInvite: (id: number) => requestData<{ status: string }>(apiClient.delete(`/residents/invites/${id}`)),
  dashboard: (month: string) => requestData<Dashboard>(apiClient.get('/dashboard', { params: { month } })),
  monthlyReport: (month: string) => requestData<MonthlyReport>(apiClient.get('/reports/monthly', { params: { month } })),
  reconciliation: () => requestData<Reconciliation>(apiClient.get('/admin/reconciliation')),
  auditLog: () => requestData<AuditEntry[]>(apiClient.get('/admin/audit')),
  contributions: (month: string) => requestData<Contribution[]>(apiClient.get('/contributions', { params: { month } })),
  pixCharges: (month: string) => requestData<PixCharge[]>(apiClient.get('/pix/charges', { params: { month } })),
  allPixCharges: () => requestData<PixCharge[]>(apiClient.get('/pix/charges/all')),
  syncMyPixCharges: () => requestData<PixCharge[]>(apiClient.post('/pix/charges/sync')),
  pixCharge: (id: number) => requestData<PixCharge>(apiClient.get(`/pix/charges/${id}`)),
  generatePixCharges: (month: string, amount: number, dueDate?: string) =>
    requestData<PixCharge[]>(apiClient.post('/admin/pix/monthly-charges', { month, amount, dueDate })),
  generatePixChargeForHouse: (month: string, amount: number, houseId: number, dueDate?: string) =>
    requestData<PixCharge>(apiClient.post('/admin/pix/house-charge', { month, amount, houseId, dueDate })),
  reconcilePixCharges: (month: string) => requestData<PixCharge[]>(apiClient.post('/admin/pix/reconcile', null, { params: { month } })),
  refreshQrCode: (id: number) => requestData<PixCharge>(apiClient.post(`/admin/pix/charges/${id}/refresh-qrcode`)),
  cancelCharge: (id: number, reason: string) => requestData<PixCharge>(apiClient.post(`/admin/pix/charges/${id}/cancel`, { reason })),
  manualPayment: (id: number, reason: string) => requestData<Contribution>(apiClient.post(`/admin/contributions/${id}/manual-payment`, { reason })),
  webhookEvents: () => requestData<WebhookEvent[]>(apiClient.get('/admin/webhook-events')),
  expenses: () => requestData<Expense[]>(apiClient.get('/expenses')),
  createExpense: (expense: Expense) => requestData<Expense>(apiClient.post('/expenses', expense)),
  updateExpense: (id: number, expense: Expense) => requestData<Expense>(apiClient.put(`/expenses/${id}`, expense)),
  services: (status?: string) => requestData<ServiceOrder[]>(apiClient.get('/services', { params: status ? { status } : {} })),
  service: (id: number) => requestData<ServiceOrder>(apiClient.get(`/services/${id}`)),
  createService: (service: ServiceOrder) => requestData<ServiceOrder>(apiClient.post('/services', service)),
  updateService: (id: number, service: ServiceOrder) => requestData<ServiceOrder>(apiClient.put(`/services/${id}`, service)),
  finishService: (id: number, payload: unknown) => requestData<ServiceOrder>(apiClient.post(`/services/${id}/finish`, payload)),
  cancelService: (id: number) => requestData<{ status: string }>(apiClient.post(`/services/${id}/cancel`)),
  budgets: () => requestData<Budget[]>(apiClient.get('/budgets')),
  serviceBudgets: (serviceId: number) => requestData<Budget[]>(apiClient.get(`/services/${serviceId}/budgets`)),
  budget: (id: number) => requestData<Budget>(apiClient.get(`/budgets/${id}`)),
  createBudget: (budget: Budget) => requestData<Budget>(apiClient.post('/budgets', budget)),
  updateBudget: (id: number, budget: Budget) => requestData<Budget>(apiClient.put(`/budgets/${id}`, budget)),
  cancelBudget: (id: number) => requestData<{ status: string }>(apiClient.delete(`/budgets/${id}`)),
  budgetVotings: () => requestData<BudgetVoting[]>(apiClient.get('/budgets/votes')),
  budgetVoting: (id: number) => requestData<BudgetVoting>(apiClient.get(`/budgets/${id}/votes`)),
  voteBudget: (id: number, vote: BudgetVoteChoice) => requestData<BudgetVoting>(apiClient.post(`/budgets/${id}/vote`, { vote })),
  closeBudgetVoting: (id: number) => requestData<BudgetVoting>(apiClient.post(`/budgets/${id}/close-voting`)),
  problemReports: (status?: string) => requestData<ProblemReport[]>(apiClient.get('/problem-reports', { params: status ? { status } : {} })),
  createProblemReport: (report: ProblemReport) => requestData<ProblemReport>(apiClient.post('/problem-reports', report)),
  updateProblemReport: (id: number, report: ProblemReport) => requestData<ProblemReport>(apiClient.put(`/problem-reports/${id}`, report)),
  problemReportEvents: (id: number) => requestData<ProblemReportEvent[]>(apiClient.get(`/problem-reports/${id}/events`)),
  addProblemComment: (id: number, message: string) => requestData<ProblemReportEvent>(apiClient.post(`/problem-reports/${id}/comments`, { message })),
  cancelProblemReport: (id: number) => requestData<ProblemReport>(apiClient.post(`/problem-reports/${id}/cancel`)),
  documents: (relatedType?: string, relatedId?: number) => requestData<PortalDocument[]>(
    apiClient.get('/documents', { params: relatedType && relatedId ? { relatedType, relatedId } : {} })
  ),
  createDocument: (document: PortalDocument) => requestData<PortalDocument>(apiClient.post('/documents', document)),
  uploadDocument: (
    file: PickedFile,
    document: Pick<PortalDocument, 'name' | 'type' | 'relatedType' | 'relatedId' | 'description'>
  ) => {
    const form = new FormData();
    form.append('name', document.name);
    form.append('type', document.type);
    if (document.relatedType) {
      form.append('relatedType', document.relatedType);
    }
    if (document.relatedId) {
      form.append('relatedId', String(document.relatedId));
    }
    if (document.description) {
      form.append('description', document.description);
    }
    appendFile(form, file);
    return requestData<PortalDocument>(apiClient.post('/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
  },
  uploadProblemPhoto: (reportId: number, file: PickedFile) => {
    const form = new FormData();
    appendFile(form, file);
    return requestData<PortalDocument>(
      apiClient.post(`/problem-reports/${reportId}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 })
    );
  },
  deleteProblemPhoto: (reportId: number, documentId: number) =>
    requestData<{ status: string }>(apiClient.delete(`/problem-reports/${reportId}/photos/${documentId}`)),
  /** A short-lived address a photo can be shown from (an <Image> cannot send the login header). */
  documentAccessUrl: async (documentId: number) => {
    // A receipt kept by Asaas (a Pix sent through it) comes back as its own link.
    const access = await requestData<{ path?: string; url?: string }>(apiClient.get(`/documents/${documentId}/access`));
    return access.url ?? `${publicBaseURL}${access.path}`;
  },
  documentUrl: (url: string) => (url.startsWith('/') ? `${publicBaseURL}${url}` : url),
  /**
   * Stored files are no longer public: ask the API for a short-lived link first. Links the user typed (or a local
   * preview) open as they are.
   */
  openDocument: async (url: string) => {
    const stored = /^\/api\/documents\/(\d+)\/file/.exec(url);
    if (!stored) {
      return Linking.openURL(api.documentUrl(url));
    }
    // The tab is opened before the request so the browser still counts it as a click and does not block it.
    const tab = Platform.OS === 'web' && typeof window !== 'undefined' ? window.open('', '_blank') : null;
    try {
      const access = await requestData<{ path?: string; url?: string }>(apiClient.get(`/documents/${stored[1]}/access`));
      const target = access.url ?? `${publicBaseURL}${access.path}`;
      if (tab) {
        tab.location.href = target;
        return undefined;
      }
      return Linking.openURL(target);
    } catch (error) {
      tab?.close();
      throw error;
    }
  },
  residents: () => requestData<Resident[]>(apiClient.get('/residents')),
  createResident: (resident: Resident) => requestData<Resident>(apiClient.post('/residents', resident)),
  updateResident: (id: number, resident: Resident) => requestData<Resident>(apiClient.put(`/residents/${id}`, resident)),
  syncResidentAsaas: (id: number) => requestData<Resident>(apiClient.post(`/residents/${id}/sync-asaas`)),
  requestResidentPasswordReset: (id: number) =>
    requestData<PasswordResetResponse>(apiClient.post(`/residents/${id}/password-reset`)),
  releaseHouse: (houseId: number) => requestData<Resident>(apiClient.post(`/admin/houses/${houseId}/release`)),
  sindico: () => requestData<Sindico>(apiClient.get('/admin/sindico')),
  chooseSindico: (residentId: number | null) => requestData<Sindico>(apiClient.put('/admin/sindico', { residentId })),
  settings: () => requestData(apiClient.get('/settings')),
  /** Who is signed in now and what they may do (canPay: record, approve and pay the bills). */
  session: () => requestData<{ role: string; canPay: boolean }>(apiClient.get('/session')),
  suppliers: () => requestData<Supplier[]>(apiClient.get('/suppliers')),
  payables: () => requestData<Payable[]>(apiClient.get('/payables')),
  createPayable: (input: PayableInput) => requestData<Payable[]>(apiClient.post('/payables', input)),
  approvePayable: (id: number) => requestData<Payable>(apiClient.post(`/payables/${id}/approve`)),
  payPayable: (id: number, input: { paidAt: string; method: string; receiptDocumentId: number | null; notes: string | null }) =>
    requestData<Payable>(apiClient.post(`/payables/${id}/pay`, input)),
  cancelPayable: (id: number, reason: string) => requestData<Payable>(apiClient.post(`/payables/${id}/cancel`, { reason })),
  /** Whether bills can be paid by Pix through Asaas here, and how much of today's limit is used. */
  pixStatus: () => requestData<PixPaymentStatus>(apiClient.get('/payables/pix')),
  /** Sends the bill's Pix from the condominium's Asaas account, confirmed with the person's own password. */
  payByPix: (id: number, password: string) => requestData<Payable>(apiClient.post(`/payables/${id}/pix`, { password })),
  /** Asks Asaas what a "copia e cola" code is (who receives it, how much). Nothing is paid. */
  readPixCode: (code: string) => requestData<PixCode>(apiClient.post('/payables/pix-code/read', { code })),
  /** Records the code's bill and pays it from the condominium's Asaas account, confirmed with the person's own password. */
  payPixCode: (input: PayPixCodeInput) => requestData<Payable>(apiClient.post('/payables/pix-code', input)),
  setBudgetRule: (budgetRequiredAbove: number | null) => requestData(apiClient.put('/settings/budget-rule', { budgetRequiredAbove })),
  registerPushToken: (token: string, platform: string) => requestData<{ status: string }>(apiClient.post('/push-tokens', { token, platform })),
  dashboardEventsUrl: () => `${baseURL.replace(/\/$/, '')}/events/dashboard`
};
