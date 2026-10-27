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

export type CondominiumDetail = {
  condominium: CondominiumSummary;
  sindicoName: string | null;
  sindicoHouse: string | null;
  administrators: number;
  activity: CondominiumActivity[];
};

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
  condominiums: () => request<CondominiumSummary[]>('/platform/condominiums'),
  condominium: (id: number) => request<CondominiumDetail>(`/platform/condominiums/${id}`),
  createCondominium: (input: NewCondominium) =>
    request<CondominiumSummary>('/platform/condominiums', { method: 'POST', body: JSON.stringify(input) }),
  renameCondominium: (id: number, name: string) =>
    request<CondominiumSummary>(`/platform/condominiums/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  setCondominiumStatus: (id: number, status: 'ACTIVE' | 'SUSPENDED') =>
    request<CondominiumSummary>(`/platform/condominiums/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) })
};
