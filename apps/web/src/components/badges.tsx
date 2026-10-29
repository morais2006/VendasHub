import { MOVEMENT_TYPE, ORDER_STATUS, type Tone } from '@/lib/labels';
import type { MovementType, OrderStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const tone: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  success: 'bg-success/10 text-success ring-success/25',
  warning: 'bg-warning/12 text-[oklch(0.45_0.11_65)] ring-warning/30',
  info: 'bg-info/10 text-info ring-info/25',
  danger: 'bg-destructive/10 text-destructive ring-destructive/25',
  brand: 'bg-accent text-accent-foreground ring-primary/20',
};

export function Pill({
  children,
  variant = 'neutral',
  className,
}: {
  children: React.ReactNode;
  variant?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        tone[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS[status];
  return <Pill variant={meta.tone}>{meta.label}</Pill>;
}

export function MovementBadge({ type }: { type: MovementType }) {
  const meta = MOVEMENT_TYPE[type];
  return <Pill variant={meta.tone}>{meta.label}</Pill>;
}

export function StockBadge({ quantity, min }: { quantity: number; min: number }) {
  if (quantity === 0) return <Pill variant="danger">Sem estoque</Pill>;
  if (quantity <= min) return <Pill variant="warning">Estoque baixo</Pill>;
  return null;
}
