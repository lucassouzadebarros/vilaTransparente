import { AxiosError } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { BudgetVoteChoice, ProblemReportEvent } from '../types';
import * as data from './demoData';
import { demoRole } from './demoMode';

/** What the person did during this demonstration: kept in memory, gone when the demonstration ends. */
const state = {
  votes: {} as Record<number, BudgetVoteChoice>,
  comments: [] as ProblemReportEvent[],
  nextId: 9000
};

export function resetDemoState() {
  state.votes = {};
  state.comments = [];
  state.nextId = 9000;
}

const nextId = () => ++state.nextId;
const isResident = () => demoRole() === 'RESIDENT';
/** The demonstration resident is house 1: a resident only sees their own charges, as in the real app. */
const mine = <T extends { houseId: number }>(rows: T[]) => (isResident() ? rows.filter((row) => row.houseId === 1) : rows);

function respond(config: InternalAxiosRequestConfig, payload: unknown, status = 200): AxiosResponse {
  return { data: payload, status, statusText: 'OK', headers: {}, config, request: {} };
}

function fail(config: InternalAxiosRequestConfig, status: number, message: string): never {
  const response = { data: { error: message }, status, statusText: 'Error', headers: {}, config } as AxiosResponse;
  throw new AxiosError(message, status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST', config, {}, response);
}

function bodyOf(config: InternalAxiosRequestConfig): Record<string, unknown> {
  const raw = config.data as unknown;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === 'object' && !(typeof FormData !== 'undefined' && raw instanceof FormData)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function pathOf(config: InternalAxiosRequestConfig) {
  const url = config.url ?? '';
  const path = url.startsWith('http') ? new URL(url).pathname.replace(/^\/api/, '') : url.split('?')[0];
  return path.replace(/\/+$/, '') || '/';
}

const monthParam = (config: InternalAxiosRequestConfig) => String((config.params as { month?: string } | undefined)?.month ?? data.thisMonth());
const idIn = (path: string, pattern: RegExp) => {
  const match = pattern.exec(path);
  return match ? Number(match[1]) : null;
};

function read(config: InternalAxiosRequestConfig, path: string): unknown {
  const params = (config.params ?? {}) as Record<string, string | number | undefined>;
  const month = monthParam(config);
  let id: number | null;

  switch (path) {
    case '/dashboard': return data.dashboard(month);
    case '/reports/monthly': return data.monthlyReport(month);
    case '/admin/reconciliation': return data.reconciliation();
    case '/admin/audit': return data.auditLog();
    case '/admin/webhook-events': return data.webhookEvents();
    case '/contributions': return mine(data.contributions(month));
    case '/pix/charges': return mine(data.pixCharges(month));
    case '/pix/charges/all': return mine(data.allPixCharges());
    case '/expenses': return data.expenses();
    case '/residents': return data.residents();
    case '/residents/houses': return data.houses();
    case '/residents/invites': return data.invites();
    case '/admin/sindico': return data.sindico();
    case '/settings': return data.settings();
    case '/services': return data.services().filter((service) => !params.status || service.status === params.status);
    case '/budgets': return data.budgets();
    case '/budgets/votes':
      return data.budgets().filter((budget) => budget.status === 'EM_ANALISE')
        .map((budget) => data.budgetVoting(budget.id as number, demoRole(), state.votes[budget.id as number] ?? null));
    case '/problem-reports': return data.problemReports().filter((report) => !params.status || report.status === params.status);
    case '/documents':
      return data.documents().filter((document) => !params.relatedType || (document.relatedType === params.relatedType && document.relatedId === Number(params.relatedId)));
    default:
  }

  if ((id = idIn(path, /^\/pix\/charges\/(\d+)$/)) != null) {
    const charge = [...data.allPixCharges(), ...data.pixCharges(data.shiftMonth(data.thisMonth(), 1))].find((item) => item.id === id);
    return charge ?? fail(config, 404, 'Cobrança não encontrada.');
  }
  if ((id = idIn(path, /^\/services\/(\d+)\/budgets$/)) != null) {
    return data.budgets().filter((budget) => budget.serviceId === id);
  }
  if ((id = idIn(path, /^\/services\/(\d+)$/)) != null) {
    return data.services().find((item) => item.id === id) ?? fail(config, 404, 'Serviço não encontrado.');
  }
  if ((id = idIn(path, /^\/budgets\/(\d+)\/votes$/)) != null) {
    return data.budgetVoting(id, demoRole(), state.votes[id] ?? null) ?? fail(config, 404, 'Orçamento não encontrado.');
  }
  if ((id = idIn(path, /^\/budgets\/(\d+)$/)) != null) {
    return data.budgets().find((item) => item.id === id) ?? fail(config, 404, 'Orçamento não encontrado.');
  }
  if ((id = idIn(path, /^\/problem-reports\/(\d+)\/events$/)) != null) {
    return [...data.problemEvents(id), ...state.comments.filter((event) => event.reportId === id)];
  }
  if (/^\/documents\/\d+\/access$/.test(path)) {
    // Example documents point at an address outside the app; nothing stored exists in the demonstration.
    return { path: '/privacidade.html' };
  }
  return fail(config, 404, 'Esta tela não tem dados de exemplo.');
}

function write(config: InternalAxiosRequestConfig, path: string, method: string): unknown {
  const body = bodyOf(config);
  const month = String(body.month ?? monthParam(config));
  let id: number | null;

  if (path === '/auth/change-password' || /^\/residents\/\d+\/password-reset$/.test(path)) {
    return { message: 'Na demonstração nenhuma senha é alterada.' };
  }
  if (path === '/auth/delete-account') {
    return fail(config, 409, 'Na demonstração não há conta para excluir.');
  }
  if (path === '/pix/charges/sync') {
    return mine(data.pixCharges(data.thisMonth()));
  }
  if (path === '/admin/pix/monthly-charges' || path === '/admin/pix/reconcile') {
    return data.pixCharges(month);
  }
  if (path === '/admin/pix/house-charge') {
    return data.pixCharges(month).find((charge) => charge.houseId === Number(body.houseId)) ?? data.pixCharges(month)[0];
  }
  if (path === '/residents/invites') {
    const houseId = Number(body.houseId);
    return {
      id: nextId(),
      houseId,
      houseNumber: houseId,
      houseLabel: `Casa ${String(houseId).padStart(2, '0')}`,
      code: 'EXEMPLO-DEMO',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    };
  }
  if (path === '/residents') {
    return { ...body, id: nextId(), temporaryPassword: 'DEMONSTRACAO', status: 'ACTIVE' };
  }
  if (path === '/documents/upload' || /^\/problem-reports\/\d+\/photos$/.test(path)) {
    return { id: nextId(), name: 'Arquivo de exemplo', type: 'OUTRO', url: 'https://example.com/', description: 'Na demonstração nada é enviado.' };
  }
  if ((id = idIn(path, /^\/budgets\/(\d+)\/vote$/)) != null) {
    state.votes[id] = String(body.vote) === 'RECUSAR' ? 'RECUSAR' : 'APROVAR';
    return data.budgetVoting(id, demoRole(), state.votes[id]);
  }
  if ((id = idIn(path, /^\/budgets\/(\d+)\/close-voting$/)) != null) {
    return data.budgetVoting(id, demoRole(), state.votes[id] ?? null);
  }
  if ((id = idIn(path, /^\/problem-reports\/(\d+)\/comments$/)) != null) {
    const event: ProblemReportEvent = { id: nextId(), reportId: id, kind: 'COMMENT', author: isResident() ? 'Casa 01' : 'Administração', message: String(body.message ?? ''), createdAt: new Date().toISOString() };
    state.comments.push(event);
    return event;
  }
  if ((id = idIn(path, /^\/problem-reports\/(\d+)\/cancel$/)) != null) {
    return { ...(data.problemReports().find((item) => item.id === id) ?? {}), status: 'CANCELADO' };
  }
  if ((id = idIn(path, /^\/services\/(\d+)\/finish$/)) != null) {
    return { ...(data.services().find((item) => item.id === id) ?? {}), status: 'FINALIZADO' };
  }
  if ((id = idIn(path, /^\/admin\/pix\/charges\/(\d+)\/cancel$/)) != null) {
    return { ...(data.allPixCharges().find((item) => item.id === id) ?? {}), status: 'CANCELLED' };
  }
  if ((id = idIn(path, /^\/admin\/pix\/charges\/(\d+)\/refresh-qrcode$/)) != null) {
    return data.allPixCharges().find((item) => item.id === id) ?? {};
  }
  if ((id = idIn(path, /^\/admin\/contributions\/(\d+)\/manual-payment$/)) != null) {
    const row = data.contributions(data.thisMonth()).find((item) => item.id === id);
    return { ...(row ?? {}), status: 'PAID', manualPayment: true, paidAmount: data.MONTHLY_AMOUNT };
  }
  if (method === 'delete' || Object.keys(body).length === 0) {
    return { status: 'DEMO', message: 'Na demonstração nada é salvo.' };
  }
  // Anything else that saves something: the demonstration says it worked, keeps nothing, and gives the data back.
  return { ...body, id: (body.id as number | undefined) ?? nextId() };
}

/** Takes the place of the network while the demonstration is on: reads answer with example data, writes change nothing. */
export async function demoAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  const method = (config.method ?? 'get').toLowerCase();
  const path = pathOf(config);
  const payload = method === 'get' ? read(config, path) : write(config, path, method);
  return respond(config, payload);
}
