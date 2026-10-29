import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { formatDayLabel, formatInt, formatMoney, formatMoneyCompact } from '@/lib/format';
import type { DashboardSummary } from '@/lib/types';

type Point = DashboardSummary['sales_by_day'][number];

const SERIES = 'var(--chart-1)';
const GRID = 'var(--border)';
const AXIS_TEXT = { fill: 'var(--muted-foreground)', fontSize: 12 };

function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const point = payload?.[0]?.payload as Point | undefined;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{formatDayLabel(point.date)}</p>
      <p className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: SERIES }} aria-hidden />
        <span className="text-muted-foreground">Faturamento</span>
        <span className="ml-auto pl-3 font-medium tabular">{formatMoney(point.revenue)}</span>
      </p>
      <p className="mt-0.5 flex items-center gap-2 pl-4">
        <span className="text-muted-foreground">Pedidos</span>
        <span className="ml-auto pl-3 tabular">{formatInt(point.orders)}</span>
      </p>
    </div>
  );
}

/**
 * Faturamento diário (série única: o título do card a identifica, sem legenda).
 * Até 62 dias: colunas (cada dia é uma barra legível). Acima: área, que mostra
 * a tendência sem virar uma parede de barras finas.
 */
export function SalesChart({ data }: { data: Point[] }) {
  const asColumns = data.length <= 62;

  const common = {
    data,
    margin: { top: 8, right: 4, bottom: 0, left: 4 },
  };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
      <XAxis
        dataKey="date"
        tickFormatter={formatDayLabel}
        interval="preserveStartEnd"
        tick={AXIS_TEXT}
        tickLine={false}
        axisLine={{ stroke: GRID }}
        minTickGap={20}
      />
      <YAxis
        tickFormatter={(value: number) => (value === 0 ? '0' : formatMoneyCompact(value))}
        tick={AXIS_TEXT}
        tickLine={false}
        axisLine={false}
        width={64}
        allowDecimals={false}
      />
      <Tooltip
        content={ChartTooltip}
        cursor={
          asColumns
            ? { fill: 'var(--muted)' }
            : { stroke: 'var(--muted-foreground)', strokeWidth: 1 }
        }
        isAnimationActive={false}
      />
    </>
  );

  return (
    <div
      className="h-64 w-full sm:h-72"
      role="img"
      aria-label="Gráfico de faturamento diário no período"
    >
      <ResponsiveContainer width="100%" height="100%">
        {asColumns ? (
          <BarChart {...common} barCategoryGap={2}>
            {axes}
            <Bar
              dataKey="revenue"
              fill={SERIES}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        ) : (
          <AreaChart {...common}>
            {axes}
            <Area
              dataKey="revenue"
              type="monotone"
              stroke={SERIES}
              strokeWidth={2}
              fill={SERIES}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--card)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
