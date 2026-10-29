import type { CacheService } from '../cache/cache-service.js';
import type { CacheStore } from '../cache/cache-store.js';
import { CACHE_NAMESPACES } from '../cache/keys.js';
import type { AppConfig } from '../config/env.js';
import type { ErrorLog } from '../observability/error-log.js';
import type { LatencyTracker } from '../observability/latency.js';
import type { Scope } from '../plugins/request-context.js';
import { DashboardRepository } from '../repositories/dashboard.repository.js';

const round2 = (value: number) => Math.round(value * 100) / 100;

interface IntegrationStatus {
  status: 'up' | 'down';
  latencyMs: number | null;
  detail: string;
}

/**
 * Monta o painel técnico. Tudo vem de medições deste processo ou de chamadas
 * feitas agora (ping); nada é simulado. Segredos nunca entram na resposta:
 * do Supabase sai só o host, do Redis só o prefixo das chaves.
 */
export class DiagnosticsService {
  private readonly startedAt = new Date();

  constructor(
    private readonly config: AppConfig,
    private readonly cache: CacheService,
    private readonly store: CacheStore,
    private readonly requests: LatencyTracker,
    private readonly errors: ErrorLog,
  ) {}

  async snapshot(scope: Scope) {
    const [supabase, redis] = await Promise.all([this.checkSupabase(scope), this.checkRedis()]);
    const keys =
      redis.status === 'up' ? await this.cache.companyKeys(scope.company.id).catch(() => []) : [];

    return {
      generated_at: new Date().toISOString(),
      process: {
        started_at: this.startedAt.toISOString(),
        uptime_seconds: Math.round(process.uptime()),
        node_version: process.version,
        environment: this.config.nodeEnv,
        timezone: this.config.timezone,
      },
      integrations: {
        supabase: { ...supabase, host: new URL(this.config.supabaseUrl).host },
        redis: {
          ...redis,
          key_prefix: this.config.redisKeyPrefix,
          connection: this.store.status(),
        },
      },
      cache: {
        ttl_seconds: this.cache.ttl,
        pending_invalidation: this.cache.hasPending(scope.company.id),
        metrics_since: this.cache.metrics.startedAt,
        namespaces: Object.fromEntries(
          CACHE_NAMESPACES.map((ns) => [ns, this.cache.metrics.namespace(ns)]),
        ),
        keys,
        events: this.cache.metrics.eventsFor(scope.company.id),
      },
      requests: this.requests.all().slice(0, 15),
      errors: this.errors.visibleTo(scope.company.id),
    };
  }

  private async checkSupabase(scope: Scope): Promise<IntegrationStatus> {
    const started = performance.now();
    try {
      await new DashboardRepository(scope.auth.db).ping(scope.company.id);
      return {
        status: 'up',
        latencyMs: round2(performance.now() - started),
        detail: 'Consulta autenticada (RLS) respondida pelo PostgREST',
      };
    } catch {
      return { status: 'down', latencyMs: null, detail: 'Falha ao consultar o banco' };
    }
  }

  private async checkRedis(): Promise<IntegrationStatus & { version: string | null }> {
    if (!this.store.isReady()) {
      return { status: 'down', latencyMs: null, detail: 'Sem conexão com o Redis', version: null };
    }
    try {
      const latencyMs = await this.store.ping();
      const version = await this.store.serverVersion().catch(() => null);
      return { status: 'up', latencyMs, detail: 'PING respondido', version };
    } catch {
      return { status: 'down', latencyMs: null, detail: 'PING sem resposta', version: null };
    }
  }
}
