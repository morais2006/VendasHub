import type { FastifyBaseLogger } from 'fastify';
import type { CacheStore } from './cache-store.js';
import type { CacheMetrics, CacheStrategy } from './cache-metrics.js';
import type { CacheKeys, CacheNamespace, CacheParams } from './keys.js';

export interface CacheMeta {
  strategy: CacheStrategy;
  namespace: CacheNamespace;
  key: string;
  ttlSeconds: number;
  /** Segundos até expirar (null quando o valor não está no Redis). */
  ttlRemaining: number | null;
  /** Quando o valor servido foi calculado no PostgreSQL. */
  computedAt: string;
  /** Tempo total da operação de cache, medido no servidor. */
  durationMs: number;
  /** Tempo gasto consultando o PostgreSQL (somente MISS e BYPASS). */
  sourceDurationMs: number | null;
  notice?: string;
}

export interface CachedResult<T> {
  data: T;
  cache: CacheMeta;
}

interface CachedEntry<T> {
  generation: string | null;
  computedAt: string;
  data: T;
}

const elapsed = (started: number) => Math.round((performance.now() - started) * 100) / 100;

/**
 * Cache-aside com invalidação por geração.
 *
 * Leitura (uma ida ao Redis traz valor, TTL e geração atual):
 *   - valor presente e da geração atual  → HIT
 *   - ausente, expirado ou de geração antiga → MISS: consulta o PostgreSQL e
 *     grava o resultado com TTL, marcado com a geração lida ANTES da consulta
 *   - Redis fora do ar → BYPASS: responde direto do PostgreSQL, sem gravar
 *
 * Invalidação (depois do commit no banco): INCR no contador de geração da
 * empresa. É O(1), não depende de varrer chaves e invalida todas as
 * combinações de filtros de uma vez. Se um cálculo estava em andamento
 * durante a alteração, ele grava com a geração antiga e é descartado na
 * próxima leitura — um resultado velho nunca volta a ser servido como atual.
 *
 * Falha ao invalidar (Redis caiu entre o commit e o INCR): a empresa fica
 * marcada como pendente; enquanto isso as leituras dela fazem BYPASS e a
 * invalidação é refeita na reconexão. Se o processo reiniciar nesse meio
 * tempo, o TTL limita a defasagem ao valor configurado.
 */
export class CacheService {
  private readonly pending = new Set<string>();

  constructor(
    private readonly store: CacheStore,
    private readonly keys: CacheKeys,
    readonly metrics: CacheMetrics,
    private readonly logger: FastifyBaseLogger,
    readonly ttl: Record<CacheNamespace, number>,
  ) {
    store.onReady(() => void this.retryPending());
  }

  get storeStatus(): string {
    return this.store.status();
  }

  async getOrCompute<T>(
    namespace: CacheNamespace,
    companyId: string,
    params: CacheParams,
    compute: () => Promise<T>,
  ): Promise<CachedResult<T>> {
    const started = performance.now();
    const key = this.keys.entry(companyId, namespace, params);
    const generationKey = this.keys.generation(companyId, namespace);
    const ttlSeconds = this.ttl[namespace];

    let generation: string | null = null;
    let redisUsable = true;

    if (this.pending.has(this.pendingId(companyId, namespace))) {
      redisUsable = await this.flushPending(companyId, namespace);
    }

    if (redisUsable) {
      try {
        const cached = await this.store.read(key, generationKey);
        generation = cached.generation;
        if (cached.value !== null) {
          const entry = this.parse<T>(cached.value, key);
          if (entry && entry.generation === generation) {
            const durationMs = elapsed(started);
            this.metrics.recordRequest(namespace, companyId, 'HIT', durationMs, key);
            this.logger.debug({ cache: 'HIT', key, ttl: cached.ttl, durationMs }, 'cache HIT');
            return {
              data: entry.data,
              cache: {
                strategy: 'HIT',
                namespace,
                key,
                ttlSeconds,
                ttlRemaining: cached.ttl >= 0 ? cached.ttl : null,
                computedAt: entry.computedAt,
                durationMs,
                sourceDurationMs: null,
              },
            };
          }
          if (entry) this.metrics.recordStaleDiscarded(namespace, companyId, key);
        }
      } catch (error) {
        redisUsable = false;
        this.logger.warn(
          { cache: 'BYPASS', err: (error as Error).message },
          'Falha ao ler o Redis; consultando o PostgreSQL diretamente',
        );
      }
    }

    // MISS ou BYPASS: a fonte da verdade é o PostgreSQL.
    const sourceStarted = performance.now();
    const data = await compute();
    const sourceDurationMs = elapsed(sourceStarted);
    const computedAt = new Date().toISOString();

    if (!redisUsable) {
      const durationMs = elapsed(started);
      this.metrics.recordRequest(namespace, companyId, 'BYPASS', durationMs, key);
      return {
        data,
        cache: {
          strategy: 'BYPASS',
          namespace,
          key,
          ttlSeconds,
          ttlRemaining: null,
          computedAt,
          durationMs,
          sourceDurationMs,
          notice: 'Cache indisponível no momento: dados consultados diretamente no banco.',
        },
      };
    }

    let stored = false;
    try {
      const entry: CachedEntry<T> = { generation, computedAt, data };
      await this.store.write(key, JSON.stringify(entry), ttlSeconds);
      stored = true;
    } catch (error) {
      this.logger.warn({ err: (error as Error).message, key }, 'Falha ao gravar no Redis');
    }

    const durationMs = elapsed(started);
    this.metrics.recordRequest(namespace, companyId, 'MISS', durationMs, key);
    this.logger.debug({ cache: 'MISS', key, stored, durationMs, sourceDurationMs }, 'cache MISS');
    return {
      data,
      cache: {
        strategy: 'MISS',
        namespace,
        key,
        ttlSeconds,
        ttlRemaining: stored ? ttlSeconds : null,
        computedAt,
        durationMs,
        sourceDurationMs,
      },
    };
  }

  /**
   * Invalida os namespaces da empresa. Chamado SOMENTE depois que o banco
   * confirmou a alteração. Nunca lança: a escrita principal já aconteceu.
   */
  async invalidate(
    companyId: string,
    namespaces: readonly CacheNamespace[],
    reason: string,
  ): Promise<boolean> {
    try {
      await this.store.bumpGenerations(namespaces.map((ns) => this.keys.generation(companyId, ns)));
      for (const ns of namespaces) {
        this.pending.delete(this.pendingId(companyId, ns));
        this.metrics.recordInvalidation(ns, companyId, true, reason);
      }
      this.logger.info({ cache: 'INVALIDATE', companyId, namespaces, reason }, 'cache invalidado');
      return true;
    } catch (error) {
      for (const ns of namespaces) {
        this.pending.add(this.pendingId(companyId, ns));
        this.metrics.recordInvalidation(ns, companyId, false, reason);
      }
      this.logger.warn(
        {
          cache: 'INVALIDATE_FAILED',
          companyId,
          namespaces,
          reason,
          err: (error as Error).message,
        },
        'falha ao invalidar o cache',
      );
      return false;
    }
  }

  async companyKeys(companyId: string) {
    return this.store.listKeys(this.keys.company(companyId), 50);
  }

  hasPending(companyId: string): boolean {
    return [...this.pending].some((id) => id.startsWith(`${companyId}|`));
  }

  private pendingId(companyId: string, namespace: CacheNamespace): string {
    return `${companyId}|${namespace}`;
  }

  private async flushPending(companyId: string, namespace: CacheNamespace): Promise<boolean> {
    try {
      await this.store.bumpGenerations([this.keys.generation(companyId, namespace)]);
      this.pending.delete(this.pendingId(companyId, namespace));
      this.metrics.recordInvalidation(namespace, companyId, true, 'invalidação pendente refeita');
      return true;
    } catch {
      return false;
    }
  }

  private async retryPending(): Promise<void> {
    for (const id of [...this.pending]) {
      const [companyId, namespace] = id.split('|') as [string, CacheNamespace];
      await this.flushPending(companyId, namespace);
    }
  }

  private parse<T>(raw: string, key: string): CachedEntry<T> | null {
    try {
      const entry = JSON.parse(raw) as CachedEntry<T>;
      return entry && typeof entry === 'object' && 'data' in entry ? entry : null;
    } catch {
      this.logger.warn({ key }, 'Valor inválido no cache; será recalculado');
      return null;
    }
  }
}
