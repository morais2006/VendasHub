import { LatencyTracker, type LatencySummary } from '../observability/latency.js';
import { CACHE_NAMESPACES, type CacheNamespace } from './keys.js';

export type CacheStrategy = 'HIT' | 'MISS' | 'BYPASS';
export type CacheEventType = CacheStrategy | 'INVALIDATE' | 'INVALIDATE_FAILED' | 'STALE_DISCARDED';

export interface CacheEvent {
  at: string;
  type: CacheEventType;
  namespace: CacheNamespace;
  companyId: string;
  key?: string;
  durationMs?: number;
  message: string;
}

interface NamespaceCounters {
  hits: number;
  misses: number;
  bypasses: number;
  staleDiscarded: number;
  invalidations: number;
  failedInvalidations: number;
}

export interface NamespaceMetrics extends NamespaceCounters {
  hitRate: number | null;
  latency: {
    hit: LatencySummary | null;
    miss: LatencySummary | null;
    bypass: LatencySummary | null;
  };
}

const MAX_EVENTS_PER_COMPANY = 40;

/**
 * Contadores do cache observados NESTE processo da API (zeram ao reiniciar).
 * Os valores em cache ficam no Redis; aqui fica só o que a aplicação mediu ao
 * usá-lo: acertos, faltas, desvios e o tempo real de cada resposta.
 */
export class CacheMetrics {
  readonly startedAt = new Date().toISOString();
  private readonly counters = new Map<CacheNamespace, NamespaceCounters>(
    CACHE_NAMESPACES.map((ns) => [
      ns,
      {
        hits: 0,
        misses: 0,
        bypasses: 0,
        staleDiscarded: 0,
        invalidations: 0,
        failedInvalidations: 0,
      },
    ]),
  );
  private readonly latency = new LatencyTracker(200);
  private readonly events = new Map<string, CacheEvent[]>();

  recordRequest(
    namespace: CacheNamespace,
    companyId: string,
    strategy: CacheStrategy,
    durationMs: number,
    key: string,
  ): void {
    const counters = this.counters.get(namespace)!;
    if (strategy === 'HIT') counters.hits += 1;
    else if (strategy === 'MISS') counters.misses += 1;
    else counters.bypasses += 1;
    this.latency.record(`${namespace}:${strategy}`, durationMs);
    const message =
      strategy === 'HIT'
        ? 'Resposta servida pelo Redis'
        : strategy === 'MISS'
          ? 'Não estava no cache: calculado no PostgreSQL e gravado no Redis'
          : 'Redis indisponível: resposta calculada direto no PostgreSQL';
    this.push({
      at: new Date().toISOString(),
      type: strategy,
      namespace,
      companyId,
      key,
      durationMs,
      message,
    });
  }

  recordStaleDiscarded(namespace: CacheNamespace, companyId: string, key: string): void {
    this.counters.get(namespace)!.staleDiscarded += 1;
    this.push({
      at: new Date().toISOString(),
      type: 'STALE_DISCARDED',
      namespace,
      companyId,
      key,
      message: 'Valor de geração antiga ignorado (houve alteração depois que foi gravado)',
    });
  }

  recordInvalidation(
    namespace: CacheNamespace,
    companyId: string,
    ok: boolean,
    reason: string,
  ): void {
    const counters = this.counters.get(namespace)!;
    if (ok) counters.invalidations += 1;
    else counters.failedInvalidations += 1;
    this.push({
      at: new Date().toISOString(),
      type: ok ? 'INVALIDATE' : 'INVALIDATE_FAILED',
      namespace,
      companyId,
      message: ok
        ? `Invalidado após: ${reason}`
        : `Falha ao invalidar após: ${reason} (será refeito na reconexão; o TTL limita a defasagem)`,
    });
  }

  namespace(namespace: CacheNamespace): NamespaceMetrics {
    const counters = this.counters.get(namespace)!;
    const lookups = counters.hits + counters.misses;
    return {
      ...counters,
      hitRate: lookups === 0 ? null : Math.round((counters.hits / lookups) * 1000) / 10,
      latency: {
        hit: this.latency.summary(`${namespace}:HIT`),
        miss: this.latency.summary(`${namespace}:MISS`),
        bypass: this.latency.summary(`${namespace}:BYPASS`),
      },
    };
  }

  eventsFor(companyId: string, limit = 30): CacheEvent[] {
    return (this.events.get(companyId) ?? []).slice(-limit).reverse();
  }

  private push(event: CacheEvent): void {
    const list = this.events.get(event.companyId) ?? [];
    list.push(event);
    if (list.length > MAX_EVENTS_PER_COMPANY) list.shift();
    this.events.set(event.companyId, list);
  }
}
