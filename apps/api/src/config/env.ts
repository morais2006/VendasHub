import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Caminho do .env na raiz do monorepo (um único arquivo para API e front-end). */
export const ROOT_ENV_PATH = fileURLToPath(new URL('../../../../.env', import.meta.url));

/**
 * Carrega o .env da raiz, se existir. Variáveis já definidas no ambiente
 * (CI, Docker, painel de hospedagem) têm prioridade e não são sobrescritas.
 */
export function loadRootEnvFile(path = ROOT_ENV_PATH): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  SUPABASE_URL: z.url({
    error: 'SUPABASE_URL deve ser a URL do projeto (https://<ref>.supabase.co)',
  }),
  SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: 'Defina SUPABASE_PUBLISHABLE_KEY (chave pública/anon do projeto)' })
    .min(20, 'SUPABASE_PUBLISHABLE_KEY parece incompleta'),
  SUPABASE_SECRET_KEY: z.string().min(20, 'SUPABASE_SECRET_KEY parece incompleta').optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_KEY_PREFIX: z
    .string()
    .regex(/^[a-z0-9-]{1,32}$/, 'REDIS_KEY_PREFIX: use letras minúsculas, números e hífen')
    .default('vendahub'),
  CACHE_TTL_DASHBOARD_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
  CACHE_TTL_CATALOG_SECONDS: z.coerce.number().int().min(5).max(3600).default(120),
  APP_TIMEZONE: z.string().default('America/Sao_Paulo'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  webOrigins: string[];
  supabaseUrl: string;
  supabasePublishableKey: string;
  /** Só usada por scripts (seed) e testes de integração. */
  supabaseSecretKey: string | undefined;
  redisUrl: string;
  redisKeyPrefix: string;
  cacheTtl: { dashboard: number; catalog: number };
  timezone: string;
  logLevel: string;
}

/** Valida as variáveis de ambiente e falha cedo, com mensagens legíveis. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse({
    ...source,
    // Aceita os nomes antigos das chaves do Supabase.
    SUPABASE_PUBLISHABLE_KEY: source.SUPABASE_PUBLISHABLE_KEY || source.SUPABASE_ANON_KEY,
    SUPABASE_SECRET_KEY:
      source.SUPABASE_SECRET_KEY || source.SUPABASE_SERVICE_ROLE_KEY || undefined,
  });

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Configuração inválida. Copie .env.example para .env (na raiz) e revise:\n${problems}`,
    );
  }

  const env = parsed.data;
  assertValidTimezone(env.APP_TIMEZONE);
  assertPublishableKeyIsPublic(env.SUPABASE_PUBLISHABLE_KEY);

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    webOrigins: env.WEB_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    supabaseUrl: env.SUPABASE_URL.replace(/\/+$/, ''),
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    supabaseSecretKey: env.SUPABASE_SECRET_KEY,
    redisUrl: env.REDIS_URL,
    redisKeyPrefix: env.REDIS_KEY_PREFIX,
    cacheTtl: {
      dashboard: env.CACHE_TTL_DASHBOARD_SECONDS,
      catalog: env.CACHE_TTL_CATALOG_SECONDS,
    },
    timezone: env.APP_TIMEZONE,
    logLevel: env.LOG_LEVEL,
  };
}

function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  } catch {
    throw new Error(`APP_TIMEZONE inválido: "${timezone}"`);
  }
}

/**
 * A chave pública vai para o navegador. Se alguém colar a chave secreta no
 * lugar dela, o RLS deixaria de proteger os dados — então recusamos iniciar.
 */
export function assertPublishableKeyIsPublic(key: string): void {
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    throw new Error(
      'SUPABASE_PUBLISHABLE_KEY contém uma chave SECRETA. Use a chave pública (publishable/anon).',
    );
  }
}

function jwtRole(token: string): string | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    return (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: string })
      .role;
  } catch {
    return undefined;
  }
}
