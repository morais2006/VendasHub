import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheMetrics } from '../../src/cache/cache-metrics.js';
import { CacheService } from '../../src/cache/cache-service.js';
import { createCacheKeys } from '../../src/cache/keys.js';
import { MemoryCacheStore, silentLogger } from '../helpers/memory-cache-store.js';

const COMPANY_A = '11111111-1111-4111-8111-111111111111';
const COMPANY_B = '22222222-2222-4222-8222-222222222222';
const params = { from: '2026-10-01', to: '2026-10-28', tz: 'America/Sao_Paulo' };

function setup() {
  const store = new MemoryCacheStore();
  const service = new CacheService(
    store,
    createCacheKeys('test'),
    new CacheMetrics(),
    silentLogger,
    { dashboard: 60, catalog: 120 },
  );
  return { store, service };
}

describe('CacheService (cache-aside com geração)', () => {
  let store: MemoryCacheStore;
  let service: CacheService;
  let compute: ReturnType<typeof vi.fn<() => Promise<{ revenue: number }>>>;

  beforeEach(() => {
    ({ store, service } = setup());
    compute = vi.fn(async () => ({ revenue: 100 }));
  });

  it('primeira leitura é MISS: consulta a fonte e grava com o TTL do namespace', async () => {
    const result = await service.getOrCompute('dashboard', COMPANY_A, params, compute);

    expect(result.cache.strategy).toBe('MISS');
    expect(result.cache.ttlRemaining).toBe(60);
    expect(result.cache.sourceDurationMs).not.toBeNull();
    expect(result.data).toEqual({ revenue: 100 });
    expect(compute).toHaveBeenCalledTimes(1);
    expect(store.writes).toBe(1);
  });

  it('segunda leitura é HIT e não consulta a fonte', async () => {
    await service.getOrCompute('dashboard', COMPANY_A, params, compute);
    store.advance(10);
    const result = await service.getOrCompute('dashboard', COMPANY_A, params, compute);

    expect(result.cache.strategy).toBe('HIT');
    expect(result.cache.ttlRemaining).toBe(50);
    expect(result.cache.sourceDurationMs).toBeNull();
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('valor expira pelo TTL e volta a ser MISS', async () => {
    await service.getOrCompute('dashboard', COMPANY_A, params, compute);
    store.advance(61);
    const result = await service.getOrCompute('dashboard', COMPANY_A, params, compute);

    expect(result.cache.strategy).toBe('MISS');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('invalidação força MISS e o valor recalculado reflete a alteração', async () => {
    await service.getOrCompute('dashboard', COMPANY_A, params, compute);
    compute.mockResolvedValueOnce({ revenue: 250 });

    await expect(service.invalidate(COMPANY_A, ['dashboard'], 'pedido #1 criado')).resolves.toBe(
      true,
    );
    const result = await service.getOrCompute('dashboard', COMPANY_A, params, compute);

    expect(result.cache.strategy).toBe('MISS');
    expect(result.data).toEqual({ revenue: 250 });
    expect(service.metrics.namespace('dashboard').invalidations).toBe(1);
  });

  it('invalidação atinge todas as combinações de filtro da empresa', async () => {
    const other = { ...params, from: '2026-09-01' };
    await service.getOrCompute('dashboard', COMPANY_A, params, compute);
    await service.getOrCompute('dashboard', COMPANY_A, other, compute);
    await service.invalidate(COMPANY_A, ['dashboard'], 'teste');

    const first = await service.getOrCompute('dashboard', COMPANY_A, params, compute);
    const second = await service.getOrCompute('dashboard', COMPANY_A, other, compute);
    expect([first.cache.strategy, second.cache.strategy]).toEqual(['MISS', 'MISS']);
  });

  it('empresas não compartilham chaves nem invalidações', async () => {
    const a = await service.getOrCompute('dashboard', COMPANY_A, params, async () => ({
      revenue: 1,
    }));
    const b = await service.getOrCompute('dashboard', COMPANY_B, params, async () => ({
      revenue: 2,
    }));
    expect(a.cache.key).not.toBe(b.cache.key);
    expect(a.cache.key).toContain(COMPANY_A);

    await service.invalidate(COMPANY_A, ['dashboard'], 'teste');
    const bAgain = await service.getOrCompute('dashboard', COMPANY_B, params, compute);
    expect(bAgain.cache.strategy).toBe('HIT');
    expect(bAgain.data).toEqual({ revenue: 2 });
  });

  it('cálculo concorrente com uma invalidação não deixa valor velho como atual', async () => {
    let release!: () => void;
    const slow = vi.fn(
      () =>
        new Promise<{ revenue: number }>((resolve) => {
          release = () => resolve({ revenue: 100 });
        }),
    );
    // Leitura começa (geração atual) e fica calculando...
    const pending = service.getOrCompute('dashboard', COMPANY_A, params, slow);
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());
    // ...enquanto uma venda é confirmada e invalida o cache.
    await service.invalidate(COMPANY_A, ['dashboard'], 'pedido criado durante o cálculo');
    release();
    await pending;

    compute.mockResolvedValueOnce({ revenue: 180 });
    const next = await service.getOrCompute('dashboard', COMPANY_A, params, compute);
    expect(next.cache.strategy).toBe('MISS');
    expect(next.data).toEqual({ revenue: 180 });
    expect(service.metrics.namespace('dashboard').staleDiscarded).toBe(1);
  });

  it('Redis fora do ar: BYPASS direto na fonte, sem erro para o usuário', async () => {
    store.setDown(true);
    const result = await service.getOrCompute('dashboard', COMPANY_A, params, compute);

    expect(result.cache.strategy).toBe('BYPASS');
    expect(result.cache.notice).toMatch(/indisponível/);
    expect(result.data).toEqual({ revenue: 100 });
    expect(service.metrics.namespace('dashboard').bypasses).toBe(1);
  });

  it('falha ao invalidar: leituras da empresa fazem BYPASS até a invalidação ser refeita', async () => {
    await service.getOrCompute('dashboard', COMPANY_A, params, compute);

    store.setDown(true);
    await expect(service.invalidate(COMPANY_A, ['dashboard'], 'venda')).resolves.toBe(false);
    expect(service.hasPending(COMPANY_A)).toBe(true);

    // Redis volta: a reconexão refaz a invalidação pendente.
    store.setDown(false);
    await vi.waitFor(() => expect(service.hasPending(COMPANY_A)).toBe(false));

    compute.mockResolvedValueOnce({ revenue: 300 });
    const result = await service.getOrCompute('dashboard', COMPANY_A, params, compute);
    expect(result.cache.strategy).toBe('MISS');
    expect(result.data).toEqual({ revenue: 300 });
  });

  it('erro da fonte de dados é propagado e nada é gravado', async () => {
    const failing = vi.fn(async () => {
      throw new Error('banco fora');
    });
    await expect(service.getOrCompute('catalog', COMPANY_A, {}, failing)).rejects.toThrow(
      'banco fora',
    );
    expect(store.writes).toBe(0);
  });

  it('métricas registram hits, misses e taxa de acerto reais', async () => {
    await service.getOrCompute('catalog', COMPANY_A, { page: 1 }, compute);
    await service.getOrCompute('catalog', COMPANY_A, { page: 1 }, compute);
    await service.getOrCompute('catalog', COMPANY_A, { page: 1 }, compute);

    const metrics = service.metrics.namespace('catalog');
    expect(metrics.hits).toBe(2);
    expect(metrics.misses).toBe(1);
    expect(metrics.hitRate).toBe(66.7);
    expect(metrics.latency.hit?.count).toBe(2);
    expect(service.metrics.eventsFor(COMPANY_A).map((e) => e.type)).toEqual(['HIT', 'HIT', 'MISS']);
    expect(service.metrics.eventsFor(COMPANY_B)).toEqual([]);
  });
});
