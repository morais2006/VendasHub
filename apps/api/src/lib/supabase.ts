import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types.js';

export type Db = SupabaseClient<Database>;

const serverAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

/**
 * Cliente que age COMO o usuário da requisição: o token dele segue em cada
 * chamada ao PostgREST, então o RLS do PostgreSQL decide o que pode ser lido
 * ou alterado. É o cliente usado por todas as rotas da API.
 */
export function createUserClient(url: string, publishableKey: string, accessToken: string): Db {
  return createClient<Database>(url, publishableKey, {
    auth: serverAuthOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Cliente sem sessão, usado apenas para validar tokens (getClaims). */
export function createAuthClient(url: string, publishableKey: string): Db {
  return createClient<Database>(url, publishableKey, { auth: serverAuthOptions });
}

/**
 * Cliente administrativo (chave secreta): ignora o RLS. Usado SOMENTE pelo
 * seed de demonstração e pelos testes de integração, nunca pelas rotas.
 */
export function createAdminClient(url: string, secretKey: string): Db {
  return createClient<Database>(url, secretKey, { auth: serverAuthOptions });
}
