import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Budget,
  Contribution,
  Dashboard,
  Expense,
  PasswordResetResponse,
  PixCharge,
  PortalDocument,
  RegistrationHouseOption,
  Resident,
  ResidentRegistration,
  ResidentRegistrationResponse,
  ServiceOrder,
  Session,
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

export const apiClient = axios.create({ baseURL, timeout: 20000 });

const publicRequestPaths = new Set([
  '/auth/login',
  '/auth/register-resident',
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
  '/residents/registration-houses'
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

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      await AsyncStorage.removeItem('portal-vila-session');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('portal-vila-auth-expired'));
      }
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
  changePassword: (currentPassword: string, newPassword: string) =>
    requestData<PasswordResetResponse>(apiClient.post('/auth/change-password', { currentPassword, newPassword })),
  registrationHouses: () => requestData<RegistrationHouseOption[]>(apiClient.get('/residents/registration-houses')),
  registerResident: (registration: ResidentRegistration) =>
    requestData<ResidentRegistrationResponse>(apiClient.post('/auth/register-resident', registration)),
  dashboard: (month: string) => requestData<Dashboard>(apiClient.get('/dashboard', { params: { month } })),
  contributions: (month: string) => requestData<Contribution[]>(apiClient.get('/contributions', { params: { month } })),
  pixCharges: (month: string) => requestData<PixCharge[]>(apiClient.get('/pix/charges', { params: { month } })),
  allPixCharges: () => requestData<PixCharge[]>(apiClient.get('/pix/charges/all')),
  syncMyPixCharges: () => requestData<PixCharge[]>(apiClient.post('/pix/charges/sync')),
  pixCharge: (id: number) => requestData<PixCharge>(apiClient.get(`/pix/charges/${id}`)),
  generatePixCharges: (month: string, amount: number) => requestData<PixCharge[]>(apiClient.post('/admin/pix/monthly-charges', { month, amount })),
  generatePixChargeForHouse: (month: string, amount: number, houseId: number) =>
    requestData<PixCharge>(apiClient.post('/admin/pix/house-charge', { month, amount, houseId })),
  reconcilePixCharges: (month: string) => requestData<PixCharge[]>(apiClient.post('/admin/pix/reconcile', null, { params: { month } })),
  refreshQrCode: (id: number) => requestData<PixCharge>(apiClient.post(`/admin/pix/charges/${id}/refresh-qrcode`)),
  cancelCharge: (id: number, reason: string) => requestData<PixCharge>(apiClient.post(`/admin/pix/charges/${id}/cancel`, { reason })),
  manualPayment: (id: number, reason: string) => requestData<Contribution>(apiClient.post(`/admin/contributions/${id}/manual-payment`, { reason })),
  webhookEvents: () => requestData<WebhookEvent[]>(apiClient.get('/admin/webhook-events')),
  expenses: () => requestData<Expense[]>(apiClient.get('/expenses')),
  createExpense: (expense: Expense) => requestData<Expense>(apiClient.post('/expenses', expense)),
  services: (status?: string) => requestData<ServiceOrder[]>(apiClient.get('/services', { params: status ? { status } : {} })),
  service: (id: number) => requestData<ServiceOrder>(apiClient.get(`/services/${id}`)),
  createService: (service: ServiceOrder) => requestData<ServiceOrder>(apiClient.post('/services', service)),
  updateService: (id: number, service: ServiceOrder) => requestData<ServiceOrder>(apiClient.put(`/services/${id}`, service)),
  finishService: (id: number, payload: unknown) => requestData<ServiceOrder>(apiClient.post(`/services/${id}/finish`, payload)),
  budgets: () => requestData<Budget[]>(apiClient.get('/budgets')),
  serviceBudgets: (serviceId: number) => requestData<Budget[]>(apiClient.get(`/services/${serviceId}/budgets`)),
  budget: (id: number) => requestData<Budget>(apiClient.get(`/budgets/${id}`)),
  createBudget: (serviceId: number | null | undefined, budget: Budget) => requestData<Budget>(
    serviceId ? apiClient.post(`/services/${serviceId}/budgets`, budget) : apiClient.post('/budgets', budget)
  ),
  updateBudget: (id: number, budget: Budget) => requestData<Budget>(apiClient.put(`/budgets/${id}`, budget)),
  approveBudget: (id: number) => requestData<Budget>(apiClient.post(`/budgets/${id}/approve`)),
  rejectBudget: (id: number) => requestData<Budget>(apiClient.post(`/budgets/${id}/reject`)),
  documents: (relatedType?: string, relatedId?: number) => requestData<PortalDocument[]>(
    apiClient.get('/documents', { params: relatedType && relatedId ? { relatedType, relatedId } : {} })
  ),
  createDocument: (document: PortalDocument) => requestData<PortalDocument>(apiClient.post('/documents', document)),
  uploadDocument: (
    file: File,
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
    form.append('file', file);
    return requestData<PortalDocument>(apiClient.post('/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }));
  },
  documentUrl: (url: string) => (url.startsWith('/') ? `${publicBaseURL}${url}` : url),
  residents: () => requestData<Resident[]>(apiClient.get('/residents')),
  createResident: (resident: Resident) => requestData<Resident>(apiClient.post('/residents', resident)),
  updateResident: (id: number, resident: Resident) => requestData<Resident>(apiClient.put(`/residents/${id}`, resident)),
  syncResidentAsaas: (id: number) => requestData<Resident>(apiClient.post(`/residents/${id}/sync-asaas`)),
  requestResidentPasswordReset: (id: number) =>
    requestData<PasswordResetResponse>(apiClient.post(`/residents/${id}/password-reset`)),
  releaseHouse: (houseId: number) => requestData<Resident>(apiClient.post(`/admin/houses/${houseId}/release`)),
  settings: () => requestData(apiClient.get('/settings')),
  dashboardEventsUrl: () => `${baseURL.replace(/\/$/, '')}/events/dashboard`
};
