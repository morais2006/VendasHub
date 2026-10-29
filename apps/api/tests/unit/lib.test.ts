import { describe, expect, it } from 'vitest';
import { createCacheKeys, serializeParams } from '../../src/cache/keys.js';
import { assertPublishableKeyIsPublic, loadConfig } from '../../src/config/env.js';
import { addDays, daysBetweenInclusive, startOfDayIso, todayIn } from '../../src/lib/dates.js';
import { fromDatabaseError } from '../../src/lib/errors.js';
import { ilikeAny } from '../../src/lib/validation.js';

describe('chaves de cache', () => {
  it('serializa parâmetros de forma estável (ordem não importa) e ignora vazios', () => {
    expect(serializeParams({ to: '2026-10-28', from: '2026-10-01', search: '' })).toBe(
      'from=2026-10-01&to=2026-10-28',
    );
    expect(serializeParams({ b: 1, a: 'x y' })).toBe(serializeParams({ a: 'x y', b: 1 }));
    expect(serializeParams({})).toBe('all');
  });

  it('usa hash para parâmetros longos', () => {
    expect(serializeParams({ search: 'x'.repeat(200) })).toMatch(/^h:[0-9a-f]{40}$/);
  });

  it('inclui prefixo, versão, empresa e namespace', () => {
    const keys = createCacheKeys('vendahub');
    expect(keys.entry('c1', 'dashboard', { from: 'a' })).toBe('vendahub:v1:co:c1:dashboard:from=a');
    expect(keys.generation('c1', 'catalog')).toBe('vendahub:v1:co:c1:catalog:gen');
    expect(keys.company('c1')).toBe('vendahub:v1:co:c1:*');
  });
});

describe('datas no fuso da loja', () => {
  it('meia-noite em São Paulo corresponde a 03:00 UTC', () => {
    expect(startOfDayIso('2026-10-28', 'America/Sao_Paulo')).toBe('2026-10-28T03:00:00.000Z');
  });

  it('respeita horário de verão de outros fusos', () => {
    expect(startOfDayIso('2026-07-01', 'Europe/Lisbon')).toBe('2026-06-30T23:00:00.000Z');
    expect(startOfDayIso('2026-01-15', 'Europe/Lisbon')).toBe('2026-01-15T00:00:00.000Z');
  });

  it('calcula hoje no fuso e soma dias', () => {
    // 01:30 UTC de 29/10 ainda é 28/10 em São Paulo.
    expect(todayIn('America/Sao_Paulo', new Date('2026-10-29T01:30:00Z'))).toBe('2026-10-28');
    expect(addDays('2026-10-28', -29)).toBe('2026-09-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetweenInclusive('2026-09-29', '2026-10-28')).toBe(30);
  });
});

describe('tradução de erros do banco', () => {
  it('estoque insuficiente vira 409 com mensagem clara', () => {
    const error = fromDatabaseError({
      code: 'VH409',
      message: 'INSUFFICIENT_STOCK',
      details: JSON.stringify({ name: 'Café 500 g', available: 2, requested: 5 }),
    });
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('INSUFFICIENT_STOCK');
    expect(error.message).toBe(
      'Estoque insuficiente para "Café 500 g": disponível 2, solicitado 5.',
    );
  });

  it('SKU duplicado vira 409 sem expor o nome interno da constraint', () => {
    const error = fromDatabaseError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "products_company_sku_key"',
    });
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Já existe um produto com este SKU.');
  });

  it('violação de RLS vira 403 e erro desconhecido vira 502 genérico', () => {
    expect(
      fromDatabaseError({ code: '42501', message: 'new row violates row-level security' })
        .statusCode,
    ).toBe(403);
    const unknown = fromDatabaseError({ code: 'XX000', message: 'segredo interno' });
    expect(unknown.statusCode).toBe(502);
    expect(unknown.message).not.toContain('segredo');
  });

  it('nenhuma linha em .single() vira 404', () => {
    expect(fromDatabaseError({ code: 'PGRST116', message: 'no rows' }).statusCode).toBe(404);
  });
});

describe('busca segura', () => {
  it('escapa curingas e aspas do termo do usuário', () => {
    expect(ilikeAny(['name', 'sku'], '50%_"x"')).toBe(
      'name.ilike."%50\\%\\_\\"x\\"%",sku.ilike."%50\\%\\_\\"x\\"%"',
    );
  });
});

describe('configuração', () => {
  const base = {
    SUPABASE_URL: 'https://abc.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1234567890abcdef',
  };

  it('aplica padrões e lê os TTLs', () => {
    const config = loadConfig({ ...base, CACHE_TTL_DASHBOARD_SECONDS: '45' });
    expect(config.cacheTtl).toEqual({ dashboard: 45, catalog: 120 });
    expect(config.redisKeyPrefix).toBe('vendahub');
    expect(config.port).toBe(3333);
  });

  it('falha com mensagem clara quando falta variável obrigatória', () => {
    expect(() => loadConfig({})).toThrow(/SUPABASE_URL/);
  });

  it('recusa chave secreta no lugar da chave pública', () => {
    expect(() => assertPublishableKeyIsPublic('sb_secret_abcdefghijklmnopqrstuvwxyz')).toThrow(
      /SECRETA/,
    );
    const fakeServiceJwt = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.y`;
    expect(() => assertPublishableKeyIsPublic(fakeServiceJwt)).toThrow(/SECRETA/);
    expect(() => assertPublishableKeyIsPublic(base.SUPABASE_PUBLISHABLE_KEY)).not.toThrow();
  });
});
