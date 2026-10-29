import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
  PackageCheck,
  RefreshCw,
} from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { OrderStatusBadge } from '@/components/badges';
import { CacheBadge } from '@/components/cache-badge';
import { SalesChart } from '@/components/dashboard/sales-chart';
import { FilterTabs } from '@/components/list-controls';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '@/hooks/use-api';
import {
  formatDate,
  formatDayLabel,
  formatInt,
  formatMoney,
  formatPercent,
  percentChange,
  pluralize,
} from '@/lib/format';
import { localDate, PERIOD_OPTIONS, presetRange, type PeriodPreset } from '@/lib/period';
import type { DashboardSummary, OrderStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useActiveCompany } from '@/providers/company-provider';

function Delta({ current, previous }: { current: number | null; previous: number | null }) {
  const change = percentChange(current, previous);
  if (change == null)
    return <span className="text-xs text-muted-foreground">sem base de comparação</span>;
  const flat = Math.abs(change) < 0.05;
  const up = change > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex flex-wrap items-center gap-0.5 text-xs font-medium',
        flat ? 'text-muted-foreground' : up ? 'text-success' : 'text-destructive',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {formatPercent(change, true)}
      <span className="font-normal text-muted-foreground">&nbsp;vs. período anterior</span>
    </span>
  );
}

function StatTile({
  label,
  value,
  footer,
  className,
}: {
  label: string;
  value: string;
  footer: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('gap-2 py-4', className)}>
      <CardContent className="space-y-1.5 px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tracking-tight sm:text-2xl">{value}</p>
        <div className="min-h-4">{footer}</div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando indicadores">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

function TopProducts({ items }: { items: DashboardSummary['top_products'] }) {
  if (items.length === 0)
    return <EmptyState title="Sem vendas pagas no período" className="py-8" />;
  const max = Math.max(...items.map((item) => item.quantity));
  return (
    <ol className="space-y-3.5">
      {items.map((item, index) => (
        <li key={item.product_id} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <Link to={`/produtos/${item.product_id}`} className="min-w-0 truncate hover:underline">
              <span className="mr-1.5 text-muted-foreground tabular">{index + 1}.</span>
              {item.name}
            </Link>
            <span className="shrink-0 font-medium tabular">{formatInt(item.quantity)} un.</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-chart-1"
                style={{ width: `${Math.max(4, (item.quantity / max) * 100)}%` }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular">
              {formatMoney(item.revenue)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function LowStock({ data }: { data: DashboardSummary['low_stock'] }) {
  if (data.count === 0)
    return (
      <EmptyState
        icon={<PackageCheck />}
        title="Estoque em dia"
        description="Nenhum produto ativo abaixo do mínimo."
        className="py-8"
      />
    );
  return (
    <ul className="divide-y">
      {data.items.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
          <Link to={`/produtos/${item.id}`} className="min-w-0 hover:underline">
            <span className="block truncate">{item.name}</span>
            <span className="block text-xs text-muted-foreground">{item.sku}</span>
          </Link>
          <span className="shrink-0 text-right">
            <span
              className={cn(
                'block font-medium tabular',
                item.stock_quantity === 0 ? 'text-destructive' : 'text-[oklch(0.45_0.11_65)]',
              )}
            >
              {item.stock_quantity === 0 ? 'Esgotado' : `${formatInt(item.stock_quantity)} un.`}
            </span>
            <span className="block text-xs text-muted-foreground tabular">
              mín. {formatInt(item.min_stock)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const STATUS_ORDER: OrderStatus[] = ['pending', 'paid', 'completed', 'canceled'];

export default function DashboardPage() {
  const company = useActiveCompany();
  const [searchParams, setSearchParams] = useSearchParams();
  const preset = (searchParams.get('periodo') as PeriodPreset | null) ?? '30d';
  const today = localDate();

  const range = useMemo(() => {
    if (preset === 'custom') {
      const fallback = presetRange('30d', today);
      return {
        from: searchParams.get('de') ?? fallback.from,
        to: searchParams.get('ate') ?? fallback.to,
      };
    }
    return presetRange(PERIOD_OPTIONS.some((o) => o.value === preset) ? preset : '30d', today);
  }, [preset, searchParams, today]);

  const query = useDashboard(range);
  const data = query.data;

  const setPreset = (value: PeriodPreset) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === '30d') next.delete('periodo');
        else next.set('periodo', value);
        if (value === 'custom') {
          next.set('de', range.from);
          next.set('ate', range.to);
        } else {
          next.delete('de');
          next.delete('ate');
        }
        return next;
      },
      { replace: true },
    );

  const setCustom = (field: 'de' | 'ate', value: string) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(field, value);
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <PageHeader
        title="Painel"
        description={`${company.name} · ${formatDate(`${range.from}T12:00:00`)} a ${formatDate(`${range.to}T12:00:00`)}`}
        meta={<CacheBadge cache={data?.cache} />}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={cn(query.isFetching && 'animate-spin')} />
            Atualizar
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto">
          <FilterTabs
            label="Período"
            value={preset}
            options={PERIOD_OPTIONS}
            onChange={setPreset}
          />
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-sm">
            <Input
              type="date"
              aria-label="Data inicial"
              value={range.from}
              max={range.to}
              onChange={(e) => setCustom('de', e.target.value)}
              className="h-8 w-auto"
            />
            <span className="text-muted-foreground">até</span>
            <Input
              type="date"
              aria-label="Data final"
              value={range.to}
              min={range.from}
              max={today}
              onChange={(e) => setCustom('ate', e.target.value)}
              className="h-8 w-auto"
            />
          </div>
        )}
      </div>

      {query.isError && !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !data ? (
        <DashboardSkeleton />
      ) : (
        <div
          className={cn('space-y-4 transition-opacity', query.isPlaceholderData && 'opacity-60')}
        >
          {data.cache.notice && (
            <p className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-sm">
              <AlertTriangle className="size-4 text-warning" aria-hidden />
              {data.cache.notice}
            </p>
          )}

          <section
            aria-label="Indicadores do período"
            className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
          >
            <Card className="col-span-2 gap-2 py-4 lg:col-span-1">
              <CardContent className="space-y-1.5 px-4">
                <p className="text-sm text-muted-foreground">Faturamento</p>
                <p className="text-3xl font-semibold tracking-tight">
                  {formatMoney(data.kpis.revenue)}
                </p>
                <Delta current={data.kpis.revenue} previous={data.previous.revenue} />
              </CardContent>
            </Card>
            <StatTile
              label="Pedidos"
              value={formatInt(data.kpis.orders)}
              footer={<Delta current={data.kpis.orders} previous={data.previous.orders} />}
            />
            <StatTile
              label="Ticket médio"
              value={formatMoney(data.kpis.average_ticket)}
              footer={
                <Delta current={data.kpis.average_ticket} previous={data.previous.average_ticket} />
              }
            />
            <StatTile
              className="col-span-2 lg:col-span-1"
              label="Lucro bruto"
              value={formatMoney(data.kpis.gross_profit)}
              footer={
                <span className="text-xs text-muted-foreground">
                  {data.kpis.gross_margin == null
                    ? 'sem vendas pagas'
                    : `margem de ${formatPercent(data.kpis.gross_margin)}`}
                </span>
              }
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Faturamento por dia</CardTitle>
                <CardDescription>
                  Pedidos pagos e concluídos ·{' '}
                  {pluralize(data.kpis.items_sold, 'item vendido', 'itens vendidos')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.kpis.orders === 0 && data.kpis.revenue === 0 ? (
                  <EmptyState
                    title="Nenhuma venda neste período"
                    description="Escolha outro período ou registre uma venda."
                    action={
                      <Button asChild size="sm">
                        <Link to="/pedidos/novo">Nova venda</Link>
                      </Button>
                    }
                  />
                ) : (
                  <SalesChart data={data.sales_by_day} />
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Ver dados em tabela
                  </summary>
                  <div className="mt-2 max-h-64 overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-1.5 text-left font-medium">Dia</th>
                          <th className="px-3 py-1.5 text-right font-medium">Pedidos</th>
                          <th className="px-3 py-1.5 text-right font-medium">Faturamento</th>
                        </tr>
                      </thead>
                      <tbody className="tabular">
                        {data.sales_by_day.map((point) => (
                          <tr key={point.date} className="border-t">
                            <td className="px-3 py-1.5">{formatDayLabel(point.date)}</td>
                            <td className="px-3 py-1.5 text-right">{formatInt(point.orders)}</td>
                            <td className="px-3 py-1.5 text-right">{formatMoney(point.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mais vendidos</CardTitle>
                <CardDescription>Por quantidade, no período</CardDescription>
              </CardHeader>
              <CardContent>
                <TopProducts items={data.top_products} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Estoque baixo</CardTitle>
                <CardDescription>
                  {data.low_stock.count === 0
                    ? 'Situação atual do estoque'
                    : `${pluralize(data.low_stock.count, 'produto', 'produtos')} no mínimo ou abaixo`}
                </CardDescription>
                {data.low_stock.count > 0 && (
                  <CardAction>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/produtos?status=low">Ver todos</Link>
                    </Button>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent>
                <LowStock data={data.low_stock} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pedidos no período</CardTitle>
                <CardDescription>
                  {pluralize(
                    data.kpis.active_customers,
                    'cliente identificado',
                    'clientes identificados',
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2 text-sm">
                  {STATUS_ORDER.map((status) => (
                    <li key={status} className="flex items-center justify-between">
                      <OrderStatusBadge status={status} />
                      <span className="font-medium tabular">
                        {formatInt(data.status_breakdown[status] ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="rounded-md bg-muted px-3 py-2.5 text-sm">
                  <p className="text-muted-foreground">A receber (pendentes)</p>
                  <p className="text-lg font-semibold">{formatMoney(data.kpis.pending_amount)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
