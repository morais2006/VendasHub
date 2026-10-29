import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CacheMetrics } from '../../src/cache/cache-metrics.js';
import { CacheService } from '../../src/cache/cache-service.js';
import { RedisCacheStore } from '../../src/cache/cache-store.js';
import { createRedisClient } from '../../src/cache/redis-client.js';
import { createCacheKeys } from '../../src/cache/keys.js';
import { loadRootEnvFile } from '../../src/config/env.js';
import { silentLogger } from '../helpers/memory-cache-store.js';

loadRootEnvFile();
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function redisAvailable(): Promise<boolean> {
  const probe = new Redis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 1_500,
    retryStrategy: () => null,
    maxRetriesPerRequest: 0,
  });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

const available = await redisAvailable();
if (!available)
  console.warn(`[integração] Redis indisponível em ${REDIS_URL}: testes do Redis ignorados`);

describe.skipIf(!available)('Redis real: cache-aside, TTL e invalidação', () => {
  const prefix = `vendahub-test-${randomUUID().slice(0, 8)}`;
  const company = randomUUID();
  const client = createRedisClient(REDIS_URL);
  const store = new RedisCacheStore(client);
  const service = new CacheService(
    store,
    createCacheKeys(prefix),
    new CacheMetrics(),
    silentLogger,
    {
      dashboard: 2,
      catalog: 60,
    },
  );

  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    const keys = await client.keys(`${prefix}:*`);
    if (keys.length) await client.del(...keys);
    client.disconnect();
  });

  it('MISS grava no Redis com TTL; HIT lê sem consultar a fonte', async () => {
    let calls = 0;
    const compute = async () => ({ calls: ++calls });

    const miss = await service.getOrCompute('catalog', company, { page: 1 }, compute);
    expect(miss.cache.strategy).toBe('MISS');
    expect(await client.ttl(miss.cache.key)).toBeGreaterThan(55);

    const hit = await service.getOrCompute('catalog', company, { page: 1 }, compute);
    expect(hit.cache.strategy).toBe('HIT');
    expect(hit.data).toEqual({ calls: 1 });
    expect(calls).toBe(1);
  });

  it('chave expira pelo TTL configurado', async () => {
    const first = await service.getOrCompute('dashboard', company, { from: 'x' }, async () => 1);
    expect(first.cache.strategy).toBe('MISS');
    expect(
      (await service.getOrCompute('dashboard', company, { from: 'x' }, async () => 1)).cache
        .strategy,
    ).toBe('HIT');

    await new Promise((resolve) => setTimeout(resolve, 2_200));
    expect(await client.exists(first.cache.key)).toBe(0);
    expect(
      (await service.getOrCompute('dashboard', company, { from: 'x' }, async () => 2)).data,
    ).toBe(2);
  });

  it('invalidação incrementa a geração e força recálculo', async () => {
    await service.getOrCompute('catalog', company, { page: 2 }, async () => 'antigo');
    const generationKey = `${prefix}:v1:co:${company}:catalog:gen`;
    const before = Number((await client.get(generationKey)) ?? 0);

    expect(await service.invalidate(company, ['catalog'], 'teste')).toBe(true);
    expect(Number(await client.get(generationKey))).toBe(before + 1);

    const after = await service.getOrCompute('catalog', company, { page: 2 }, async () => 'novo');
    expect(after.cache.strategy).toBe('MISS');
    expect(after.data).toBe('novo');
  });

  it('chaves são listadas por empresa com o TTL restante', async () => {
    const keys = await service.companyKeys(company);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.key.startsWith(`${prefix}:v1:co:${company}:`))).toBe(true);
  });
});

describe('Redis indisponível: fallback para o banco', () => {
  it('responde em BYPASS e falha rápido (sem travar a requisição)', async () => {
    // Porta sem servidor: o cliente não conecta.
    const client = createRedisClient('redis://127.0.0.1:6399');
    client.connect().catch(() => undefined);
    const service = new CacheService(
      new RedisCacheStore(client),
      createCacheKeys('vendahub-test'),
      new CacheMetrics(),
      silentLogger,
      { dashboard: 60, catalog: 60 },
    );

    const started = performance.now();
    const result = await service.getOrCompute('dashboard', randomUUID(), {}, async () => ({
      ok: true,
    }));
    const elapsed = performance.now() - started;

    expect(result.cache.strategy).toBe('BYPASS');
    expect(result.data).toEqual({ ok: true });
    expect(elapsed).toBeLessThan(1_500);
    expect(await service.invalidate(randomUUID(), ['dashboard'], 'venda')).toBe(false);
    client.disconnect();
  });
});
