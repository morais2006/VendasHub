import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import type { Db } from '../../src/lib/supabase.js';
import type { MemberRole } from '../../src/plugins/request-context.js';
import { MemoryCacheStore } from '../helpers/memory-cache-store.js';

const COMPANY = '44444444-4444-4444-8444-444444444444';
const OTHER_COMPANY = '55555555-5555-4555-8555-555555555555';

/** Tokens fictícios → usuário e papel na COMPANY. */
const USERS: Record<string, { userId: string; role: MemberRole | null }> = {
  'token-owner': { userId: 'u-owner', role: 'owner' },
  'token-seller': { userId: 'u-seller', role: 'seller' },
  'token-outsider': { userId: 'u-outsider', role: null },
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({
    config: loadConfig({
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_123456',
    }),
    cacheStore: new MemoryCacheStore(),
    auth: {
      verifyToken: async (token) =>
        USERS[token] ? { userId: USERS[token].userId, email: `${token}@example.com` } : null,
      // As rotas testadas aqui param nas checagens, antes de qualquer consulta ao banco.
      createDb: () => ({}) as Db,
      lookupRole: async (_db, userId, companyId) =>
        companyId === COMPANY
          ? (Object.values(USERS).find((user) => user.userId === userId)?.role ?? null)
          : null,
    },
  });
});

afterAll(() => app.close());

const call = (
  method: 'GET' | 'POST',
  url: string,
  token?: string,
  company?: string,
  body?: object,
) =>
  app.inject({
    method,
    url,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(company ? { 'x-company-id': company } : {}),
    },
    ...(body ? { payload: body } : {}),
  });

describe('API: autenticação e autorização', () => {
  it('health é público e não expõe detalhes', async () => {
    const response = await call('GET', '/api/health');
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json()).sort()).toEqual(['redis', 'status', 'time']);
  });

  it('sem token → 401', async () => {
    const response = await call('GET', '/api/products', undefined, COMPANY);
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('token inválido → 401', async () => {
    expect((await call('GET', '/api/dashboard', 'forjado', COMPANY)).statusCode).toBe(401);
  });

  it('sem empresa selecionada → 400', async () => {
    const response = await call('GET', '/api/products', 'token-owner');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('COMPANY_REQUIRED');
  });

  it('company_id de empresa alheia é recusado (não confia no cliente) → 403', async () => {
    expect((await call('GET', '/api/products', 'token-owner', OTHER_COMPANY)).statusCode).toBe(403);
    expect((await call('GET', '/api/dashboard', 'token-outsider', COMPANY)).statusCode).toBe(403);
  });

  it('vendedor não cadastra produto nem cancela pedido → 403', async () => {
    const product = await call('POST', '/api/products', 'token-seller', COMPANY, {
      sku: 'X-1',
      name: 'Produto',
      price: 10,
    });
    expect(product.statusCode).toBe(403);
    const cancel = await call(
      'POST',
      `/api/orders/${OTHER_COMPANY}/cancel`,
      'token-seller',
      COMPANY,
      { reason: 'teste' },
    );
    expect(cancel.statusCode).toBe(403);
  });

  it('pedido sem Idempotency-Key → 400 antes de tocar no banco', async () => {
    const response = await call('POST', '/api/orders', 'token-seller', COMPANY, {
      items: [{ product_id: COMPANY, quantity: 1 }],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/Idempotency-Key/);
  });

  it('entrada inválida → 400 com os campos', async () => {
    const response = await call('POST', '/api/products', 'token-owner', COMPANY, {
      sku: '',
      price: -1,
    });
    expect(response.statusCode).toBe(400);
    const fields = response.json().error.details.fields.map((f: { field: string }) => f.field);
    expect(fields).toEqual(expect.arrayContaining(['sku', 'name', 'price']));
  });

  it('rota inexistente → 404 em JSON', async () => {
    expect((await call('GET', '/api/nao-existe', 'token-owner')).statusCode).toBe(404);
  });
});
