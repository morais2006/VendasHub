import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Configuração ausente vira uma tela explicativa em vez de erro em branco. */
export const supabaseConfigured = Boolean(url && publishableKey);

/**
 * Cliente usado SOMENTE para autenticação (login, sessão, renovação do token).
 * Os dados de negócio passam pela API, que valida o token e aplica o RLS.
 */
export const supabase = createClient(
  url || 'http://localhost.invalid',
  publishableKey || 'missing-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
