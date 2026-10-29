import { createHash } from 'node:crypto';

/**
 * Formato das chaves:
 *
 *   <prefixo>:v1:co:<empresa>:<namespace>:gen        → contador de geração
 *   <prefixo>:v1:co:<empresa>:<namespace>:<params>   → valor em cache (com TTL)
 *
 * A empresa faz parte de toda chave: o cache de uma empresa nunca é lido por
 * outra. O papel do usuário não entra porque todos os papéis enxergam os
 * mesmos indicadores e o mesmo catálogo (o RLS libera a leitura a todos os
 * membros). Mudou o formato do valor? Suba a versão (v1 → v2) e as chaves
 * antigas deixam de ser lidas e expiram sozinhas pelo TTL.
 */
export const CACHE_SCHEMA_VERSION = 'v1';

export type CacheNamespace = 'dashboard' | 'catalog';
export const CACHE_NAMESPACES: readonly CacheNamespace[] = ['dashboard', 'catalog'];

export type CacheParams = Record<string, string | number | boolean | null | undefined>;

/** Serialização estável e legível dos parâmetros da consulta. */
export function serializeParams(params: CacheParams): string {
  const serialized = Object.keys(params)
    .sort()
    .filter((name) => params[name] !== undefined && params[name] !== null && params[name] !== '')
    .map((name) => `${name}=${encodeURIComponent(String(params[name]))}`)
    .join('&');
  if (serialized.length === 0) return 'all';
  // Buscas longas viram hash para manter as chaves curtas.
  return serialized.length > 120
    ? `h:${createHash('sha1').update(serialized).digest('hex')}`
    : serialized;
}

export function createCacheKeys(prefix: string) {
  const base = `${prefix}:${CACHE_SCHEMA_VERSION}`;
  return {
    company: (companyId: string) => `${base}:co:${companyId}:*`,
    generation: (companyId: string, namespace: CacheNamespace) =>
      `${base}:co:${companyId}:${namespace}:gen`,
    entry: (companyId: string, namespace: CacheNamespace, params: CacheParams) =>
      `${base}:co:${companyId}:${namespace}:${serializeParams(params)}`,
  };
}

export type CacheKeys = ReturnType<typeof createCacheKeys>;
