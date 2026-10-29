import { activeCompany } from './company-storage';
import { supabase } from './supabase';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: { fields?: Array<{ field: string; message: string }> } & Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ApiErrorBody['details'],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details?.fields ?? []).map((f) => [f.field, f.message]));
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** Rotas de conta não exigem empresa selecionada. */
  withCompany?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

/** Cliente HTTP da API: anexa o token da sessão e a empresa ativa. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const company = activeCompany.get();

  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.withCompany !== false && company) headers['X-Company-Id'] = company;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Não foi possível falar com o servidor. Verifique se a API está rodando.',
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = (payload as { error?: ApiErrorBody } | null)?.error;
    throw new ApiError(
      response.status,
      body?.code ?? 'HTTP_ERROR',
      body?.message ?? `Falha inesperada (HTTP ${response.status}).`,
      body?.details,
    );
  }
  return payload as T;
}
