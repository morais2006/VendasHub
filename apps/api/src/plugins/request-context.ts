import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';
import { AppError, forbidden, unauthorized } from '../lib/errors.js';
import type { Db } from '../lib/supabase.js';
import type { Enums } from '../types/database.types.js';

export type MemberRole = Enums<'member_role'>;

export interface AuthContext {
  userId: string;
  email: string | null;
  /** Cliente Supabase que age como o usuário (RLS aplicado). */
  db: Db;
}

export interface CompanyContext {
  id: string;
  role: MemberRole;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
    company: CompanyContext | null;
  }
}

export interface VerifiedToken {
  userId: string;
  email: string | null;
}

export interface AuthDeps {
  /** Valida a assinatura e a validade do JWT do Supabase Auth. */
  verifyToken(token: string): Promise<VerifiedToken | null>;
  createDb(token: string): Db;
  /** Papel do usuário na empresa (null se não for membro). */
  lookupRole(db: Db, userId: string, companyId: string): Promise<MemberRole | null>;
}

const MEMBERSHIP_TTL_MS = 30_000;
const uuid = z.uuid();

/**
 * Associação usuário↔empresa em memória por 30 s, para não consultar o banco a
 * cada requisição. É seguro: o RLS e as funções SQL conferem a associação e o
 * papel de novo em toda operação, então um vínculo removido nunca dá acesso a
 * dados — no máximo, a API demora até 30 s para devolver 403 em vez de vazio.
 */
export class MembershipCache {
  private readonly entries = new Map<string, { role: MemberRole | null; expires: number }>();

  get(userId: string, companyId: string): MemberRole | null | undefined {
    const entry = this.entries.get(`${userId}:${companyId}`);
    if (!entry || entry.expires < Date.now()) return undefined;
    return entry.role;
  }

  set(userId: string, companyId: string, role: MemberRole | null): void {
    if (this.entries.size > 5_000) this.entries.clear();
    this.entries.set(`${userId}:${companyId}`, { role, expires: Date.now() + MEMBERSHIP_TTL_MS });
  }

  forget(userId: string): void {
    for (const key of this.entries.keys())
      if (key.startsWith(`${userId}:`)) this.entries.delete(key);
  }
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Exige sessão válida do Supabase Auth. */
export function authenticate(deps: AuthDeps): preHandlerHookHandler {
  return async (request: FastifyRequest) => {
    const token = bearerToken(request);
    if (!token) throw unauthorized('Faça login para continuar.');
    const verified = await deps.verifyToken(token);
    if (!verified) throw unauthorized();
    request.auth = { userId: verified.userId, email: verified.email, db: deps.createDb(token) };
  };
}

/**
 * Exige o cabeçalho X-Company-Id e confere, no banco, se o usuário é membro
 * da empresa (e se tem um dos papéis exigidos). O company_id vindo do cliente
 * nunca é usado sem essa checagem.
 */
export function requireCompany(
  deps: AuthDeps,
  memberships: MembershipCache,
  roles?: readonly MemberRole[],
): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const auth = requireAuth(request);
    const raw = request.headers['x-company-id'];
    const companyId = Array.isArray(raw) ? raw[0] : raw;
    if (!companyId || !uuid.safeParse(companyId).success) {
      throw new AppError(
        400,
        'COMPANY_REQUIRED',
        'Selecione uma empresa (cabeçalho X-Company-Id).',
      );
    }

    let role = memberships.get(auth.userId, companyId);
    if (role === undefined) {
      role = await deps.lookupRole(auth.db, auth.userId, companyId);
      memberships.set(auth.userId, companyId, role);
    }
    if (!role) throw forbidden('Você não tem acesso a esta empresa.');
    if (roles && !roles.includes(role)) throw forbidden();

    request.company = { id: companyId, role };
  };
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

export interface Scope {
  auth: AuthContext;
  company: CompanyContext;
}

export function requireScope(request: FastifyRequest): Scope {
  if (!request.auth) throw unauthorized();
  if (!request.company) throw forbidden('Você não tem acesso a esta empresa.');
  return { auth: request.auth, company: request.company };
}
