import { useQueryClient } from '@tanstack/react-query';
import {
  Database,
  Eraser,
  Gauge,
  Loader2,
  Pause,
  Play,
  Play as Run,
  RefreshCw,
  Server,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Pill } from '@/components/badges';
import type { Tone } from '@/lib/labels';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/states';
import { errorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDiagnostics } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { formatInt, formatMs, formatPercent, formatTime } from '@/lib/format';
import { presetRange } from '@/lib/period';
import type {
  CacheEventType,
  CacheMeta,
  DashboardSummary,
  Diagnostics,
  NamespaceMetrics,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { canManage, useActiveCompany } from '@/providers/company-provider';

const EVENT_TONE: Record<CacheEventType, { label: string; tone: Tone }> = {
  HIT: { label: 'HIT', tone: 'success' },
  MISS: { label: 'MISS', tone: 'info' },
  BYPASS: { label: 'BYPASS', tone: 'warning' },
  INVALIDATE: { label: 'INVALIDAÇÃO', tone: 'brand' },
  INVALIDATE_FAILED: { label: 'FALHA AO INVALIDAR', tone: 'danger' },
  STALE_DISCARDED: { label: 'DESCARTADO', tone: 'neutral' },
};

function StatusDot({ up }: { up: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm font-medium',
        up ? 'text-success' : 'text-destructive',
      )}
    >
      <span
        className={cn('size-2 rounded-full', up ? 'bg-success' : 'bg-destructive')}
        aria-hidden
      />
      {up ? 'Operacional' : 'Indisponível'}
    </span>
  );
}

function IntegrationCard({
  icon: Icon,
  title,
  up,
  rows,
}: {
  icon: typeof Database;
  title: string;
  up: boolean;
  rows: Array<[string, React.ReactNode]>;
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden /> {title}
        </CardTitle>
        <CardAction>
          <StatusDot up={up} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 truncate text-right tabular">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Comparação HIT × MISS com as médias realmente medidas (sem valores fixos). */
function LatencyCompare({ metrics }: { metrics: NamespaceMetrics }) {
  const rows = [
    { label: 'HIT (Redis)', summary: metrics.latency.hit },
    { label: 'MISS (PostgreSQL)', summary: metrics.latency.miss },
    { label: 'BYPASS', summary: metrics.latency.bypass },
  ].filter((row) => row.summary);
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Sem medições ainda.</p>;
  const max = Math.max(...rows.map((row) => row.summary!.avgMs));
  return (
    <ul className="space-y-2.5">
      {rows.map(({ label, summary }) => (
        <li key={label} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{label}</span>
            <span className="font-medium tabular">
              {formatMs(summary!.avgMs)}{' '}
              <span className="font-normal text-muted-foreground">
                média · p95 {formatMs(summary!.p95Ms)}
              </span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${Math.max(2, (summary!.avgMs / max) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground tabular">
            {formatInt(summary!.count)} medições
          </p>
        </li>
      ))}
    </ul>
  );
}

function NamespaceCard({
  title,
  ttl,
  metrics,
}: {
  title: string;
  ttl: number;
  metrics: NamespaceMetrics;
}) {
  const stats: Array<[string, string]> = [
    ['Hits', formatInt(metrics.hits)],
    ['Misses', formatInt(metrics.misses)],
    ['Bypass', formatInt(metrics.bypasses)],
    ['Taxa de acerto', formatPercent(metrics.hitRate)],
    ['Invalidações', formatInt(metrics.invalidations)],
    ['Falhas ao invalidar', formatInt(metrics.failedInvalidations)],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          TTL de {ttl} s · {formatInt(metrics.staleDiscarded)} valor(es) de geração antiga
          descartado(s)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-3 gap-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-md bg-muted/60 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-lg font-semibold tabular">{value}</dd>
            </div>
          ))}
        </dl>
        <LatencyCompare metrics={metrics} />
      </CardContent>
    </Card>
  );
}

interface ProbeResult {
  at: string;
  cache: CacheMeta;
  roundTripMs: number;
  revenue: number;
}

/** Roteiro da apresentação: consultar, alterar dados, consultar de novo. */
function CacheDemo({ diagnostics }: { diagnostics: Diagnostics }) {
  const company = useActiveCompany();
  const queryClient = useQueryClient();
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [busy, setBusy] = useState<'probe' | 'invalidate' | null>(null);

  async function probe() {
    setBusy('probe');
    try {
      const started = performance.now();
      const data = await api<DashboardSummary>('/dashboard', { query: presetRange('30d') });
      const roundTripMs = performance.now() - started;
      setResults((current) =>
        [
          {
            at: new Date().toISOString(),
            cache: data.cache,
            roundTripMs,
            revenue: data.kpis.revenue,
          },
          ...current,
        ].slice(0, 8),
      );
      await queryClient.invalidateQueries({ queryKey: ['diagnostics'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function invalidate() {
    setBusy('invalidate');
    try {
      await api('/system/cache/invalidate', { method: 'POST' });
      toast.success('Cache da empresa invalidado');
      await queryClient.invalidateQueries({ queryKey: ['diagnostics'] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demonstração do cache</CardTitle>
        <CardDescription>
          1) Consulte o dashboard (MISS) · 2) consulte de novo (HIT) · 3){' '}
          <Link to="/pedidos/novo" className="text-primary hover:underline">
            registre uma venda
          </Link>{' '}
          · 4) consulte outra vez (MISS com o valor recalculado).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => void probe()}
            disabled={busy !== null || diagnostics.integrations.supabase.status === 'down'}
          >
            {busy === 'probe' ? <Loader2 className="animate-spin" /> : <Run />}
            Consultar dashboard (30 dias)
          </Button>
          {canManage(company.role) && (
            <Button variant="outline" onClick={() => void invalidate()} disabled={busy !== null}>
              {busy === 'invalidate' ? <Loader2 className="animate-spin" /> : <Eraser />}
              Invalidar cache manualmente
            </Button>
          )}
        </div>
        {results.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Hora</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Servidor</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Banco</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Ida e volta</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => (
                <TableRow key={result.at}>
                  <TableCell className="tabular">{formatTime(result.at)}</TableCell>
                  <TableCell>
                    <Pill variant={EVENT_TONE[result.cache.strategy].tone}>
                      {result.cache.strategy}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {formatMs(result.cache.durationMs)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular sm:table-cell">
                    {formatMs(result.cache.sourceDurationMs)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular sm:table-cell">
                    {formatMs(result.roundTripMs)}
                  </TableCell>
                  <TableCell className="text-right tabular">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      result.revenue,
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          "Servidor" é o tempo da operação de cache medido na API; "Banco" é só a consulta ao
          PostgreSQL (ausente no HIT); "Ida e volta" inclui a rede entre o navegador e a API.
        </p>
      </CardContent>
    </Card>
  );
}

function KeysTable({ keys, fetchedAt }: { keys: Diagnostics['cache']['keys']; fetchedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.floor((now - new Date(fetchedAt).getTime()) / 1000);

  if (keys.length === 0)
    return (
      <p className="px-4 pb-4 text-sm text-muted-foreground">
        Nenhuma chave desta empresa no Redis.
      </p>
    );
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-full">Chave</TableHead>
          <TableHead className="text-right">TTL</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map(({ key, ttl }) => {
          const remaining = ttl < 0 ? ttl : Math.max(0, ttl - elapsed);
          return (
            <TableRow key={key}>
              <TableCell className="max-w-0 font-mono text-xs">
                <span className="block truncate" title={key}>
                  {key}
                </span>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular">
                {ttl === -1
                  ? 'contador (sem TTL)'
                  : remaining === 0
                    ? 'expirada'
                    : `${remaining} s`}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default function DiagnosticsPage() {
  const [live, setLive] = useState(true);
  const query = useDiagnostics(live ? 5_000 : false);
  const data = query.data;

  return (
    <>
      <PageHeader
        title="Diagnóstico"
        description="Estado das integrações e comportamento real do cache, medido por esta instância da API."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setLive(!live)}>
              {live ? <Pause /> : <Play />}
              {live ? 'Pausar atualização' : 'Atualizar a cada 5 s'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={cn(query.isFetching && 'animate-spin')} /> Atualizar
            </Button>
          </>
        }
      />

      {query.isError && !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !data ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <IntegrationCard
              icon={Database}
              title="Supabase (PostgreSQL + Auth)"
              up={data.integrations.supabase.status === 'up'}
              rows={[
                ['Latência agora', formatMs(data.integrations.supabase.latencyMs)],
                ['Projeto', data.integrations.supabase.host],
                ['Verificação', data.integrations.supabase.detail],
              ]}
            />
            <IntegrationCard
              icon={Server}
              title="Redis"
              up={data.integrations.redis.status === 'up'}
              rows={[
                ['PING', formatMs(data.integrations.redis.latencyMs)],
                ['Versão', data.integrations.redis.version ?? '—'],
                ['Conexão', data.integrations.redis.connection],
                ['Prefixo das chaves', data.integrations.redis.key_prefix],
              ]}
            />
          </div>

          {data.cache.pending_invalidation && (
            <ErrorState
              error={
                new Error(
                  'Há invalidação pendente para esta empresa: até ela ser refeita, as leituras vão direto ao banco (BYPASS).',
                )
              }
            />
          )}

          <CacheDemo diagnostics={data} />

          <div className="grid gap-4 lg:grid-cols-2">
            <NamespaceCard
              title="Indicadores do dashboard"
              ttl={data.cache.ttl_seconds.dashboard}
              metrics={data.cache.namespaces.dashboard}
            />
            <NamespaceCard
              title="Catálogo de produtos"
              ttl={data.cache.ttl_seconds.catalog}
              metrics={data.cache.namespaces.catalog}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="gap-0 pb-0">
              <CardHeader className="pb-3">
                <CardTitle>Eventos do cache</CardTitle>
                <CardDescription>Últimos acontecimentos desta empresa</CardDescription>
              </CardHeader>
              {data.cache.events.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  Nenhum evento desde o início da API.
                </p>
              ) : (
                <ul className="max-h-96 divide-y overflow-auto border-t">
                  {data.cache.events.map((event, index) => (
                    <li key={`${event.at}-${index}`} className="flex gap-3 px-4 py-2.5 text-sm">
                      <span className="w-16 shrink-0 text-xs text-muted-foreground tabular">
                        {formatTime(event.at)}
                      </span>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill variant={EVENT_TONE[event.type].tone}>
                            {EVENT_TONE[event.type].label}
                          </Pill>
                          <span className="text-xs text-muted-foreground">
                            {event.namespace === 'dashboard' ? 'dashboard' : 'catálogo'}
                          </span>
                          {event.durationMs != null && (
                            <span className="text-xs tabular">{formatMs(event.durationMs)}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{event.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="gap-0 pb-0">
              <CardHeader className="pb-3">
                <CardTitle>Chaves desta empresa no Redis</CardTitle>
                <CardDescription>TTL contado a partir da última leitura</CardDescription>
              </CardHeader>
              <KeysTable keys={data.cache.keys} fetchedAt={data.generated_at} />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="gap-0 pb-0 lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Gauge className="size-4 text-muted-foreground" aria-hidden /> Latência por rota
                  da API
                </CardTitle>
                <CardDescription>
                  Últimas 200 requisições de cada rota, medidas no servidor
                </CardDescription>
              </CardHeader>
              {data.requests.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  Sem requisições registradas.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-full">Rota</TableHead>
                      <TableHead className="text-right">Req.</TableHead>
                      <TableHead className="text-right">Média</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">p95</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.requests.map((route) => (
                      <TableRow key={route.name}>
                        <TableCell className="max-w-0 font-mono text-xs">
                          <span className="block truncate">{route.name}</span>
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {formatInt(route.count)}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {formatMs(route.avgMs)}
                        </TableCell>
                        <TableCell className="hidden text-right tabular sm:table-cell">
                          {formatMs(route.p95Ms)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Erros recentes</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.errors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum erro registrado.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {data.errors.map((error, index) => (
                        <li
                          key={`${error.at}-${index}`}
                          className="rounded-md bg-destructive/5 px-3 py-2"
                        >
                          <p className="font-medium">{error.code}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(error.at)} · {error.route ?? error.source} · {error.message}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Processo da API</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-muted-foreground">Ambiente</dt>
                    <dd className="text-right">{data.process.environment}</dd>
                    <dt className="text-muted-foreground">Node.js</dt>
                    <dd className="text-right tabular">{data.process.node_version}</dd>
                    <dt className="text-muted-foreground">No ar há</dt>
                    <dd className="text-right tabular">
                      {formatInt(Math.round(data.process.uptime_seconds / 60))} min
                    </dd>
                    <dt className="text-muted-foreground">Métricas desde</dt>
                    <dd className="text-right tabular">{formatTime(data.cache.metrics_since)}</dd>
                    <dt className="text-muted-foreground">Fuso</dt>
                    <dd className="text-right">{data.process.timezone}</dd>
                  </dl>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
