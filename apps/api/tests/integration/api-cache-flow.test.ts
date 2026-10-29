import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { RedisCacheStore } from '../../src/cache/cache-store.js';
import { createRedisClient } from '../../src/cache/redis-client.js';
import { createAuthClient, createUserClient } from '../../src/lib/supabase.js';
import { AccountRepository } from '../../src/repositories/account.repository.js';
import { cleanup, createTenant, env, integrationEnabled, type TestTenant } from './support.js';

/**
 * Fluxo completo pela API real (Fastify + Supabase + Redis), o mesmo roteiro
 * da demonstração: MISS → HIT → venda → invalidação → MISS com novo valor.
 */
describe.skipIf(!integrationEnabled)('API: dashboard com cache e invalidação após venda', () => {
  let app: FastifyInstance;
  let tenant: TestTenant;
  const redis = createRedisClient(process.env.REDIS_URL || 'redis://localhost:6379');

  beforeAll(async () => {
    const config = { ...env(), redisKeyPrefix: `vendahub-it-${randomUUID().slice(0, 6)}` };
    await redis.connect().catch(() => undefined);
    const authClient = createAuthClient(config.supabaseUrl, config.supabasePublishableKey);
    app = await buildApp({
      config,
      cacheStore: new RedisCacheStore(redis),
      auth: {
        async verifyToken(token) {
          const { data, error } = await authClient.auth.getClaims(token);
          if (error || !data?.claims?.sub) return null;
          return { userId: data.claims.sub, email: null };
        },
        createDb: (token) =>
          createUserClient(config.supabaseUrl, config.supabasePublishableKey, token),
        lookupRole: (db, userId, companyId) => new AccountRepository(db).role(userId, companyId),
      },
    });
    tenant = await createTenant('api');
  });

  afterAll(async () => {
    await app?.close();
    const keys = await redis.keys('vendahub-it-*').catch(() => [] as string[]);
    if (keys.length) await redis.del(...keys);
    redis.disconnect();
    await cleanup();
  });

  const request = (
    method: 'GET' | 'POST',
    url: string,
    body?: object,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url,
      headers: {
        authorization: `Bearer ${tenant.owner.token}`,
        'x-company-id': tenant.companyId,
        ...headers,
      },
      ...(body ? { payload: body } : {}),
    });

  it('MISS, HIT, venda, invalidação e recálculo', async () => {
    const redisUp = redis.status === 'ready';

    const first = (await request('GET', '/api/dashboard')).json();
    expect(first.cache.strategy).toBe(redisUp ? 'MISS' : 'BYPASS');
    const revenueBefore = first.kpis.revenue as number;

    if (redisUp) {
      const second = (await request('GET', '/api/dashboard')).json();
      expect(second.cache.strategy).toBe('HIT');
      expect(second.cache.durationMs).toBeLessThan(first.cache.durationMs);
    }

    const sale = await request(
      'POST',
      '/api/orders',
      { items: [{ product_id: tenant.products['A-1']!.id, quantity: 2 }], status: 'paid' },
      { 'idempotency-key': randomUUID() },
    );
    expect(sale.statusCode).toBe(201);
    expect(sale.json().total).toBe(21);

    const third = (await request('GET', '/api/dashboard')).json();
    expect(third.cache.strategy).toBe(redisUp ? 'MISS' : 'BYPASS');
    expect(third.kpis.revenue).toBe(revenueBefore + 21);

    const diagnostics = (await request('GET', '/api/system/diagnostics')).json();
    expect(diagnostics.integrations.supabase.status).toBe('up');
    if (redisUp) {
      const types = diagnostics.cache.events.map((e: { type: string }) => e.type);
      expect(types).toEqual(expect.arrayContaining(['MISS', 'HIT', 'INVALIDATE']));
    }
  });

  it('repetir a venda com a mesma chave devolve o mesmo pedido (200)', async () => {
    const key = randomUUID();
    const body = { items: [{ product_id: tenant.products['B-1']!.id, quantity: 1 }] };
    const first = await request('POST', '/api/orders', body, { 'idempotency-key': key });
    const second = await request('POST', '/api/orders', body, { 'idempotency-key': key });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(first.json().id);
  });

  it('estoque insuficiente vira 409 com mensagem legível', async () => {
    const response = await request(
      'POST',
      '/api/orders',
      { items: [{ product_id: tenant.products['C-1']!.id, quantity: 50 }] },
      { 'idempotency-key': randomUUID() },
    );
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toMatch(/Estoque insuficiente para "Produto C"/);
  });
});
