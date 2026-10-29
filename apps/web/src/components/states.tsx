import { AlertTriangle, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/error-message';
import { cn } from '@/lib/utils';

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center',
        className,
      )}
    >
      <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
      <p className="flex-1 text-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RotateCw /> Tentar de novo
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}>
      {icon && <div className="mb-1 text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-px p-3" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-4 py-2">
          {Array.from({ length: columns }, (_, col) => (
            <Skeleton key={col} className={cn('h-4', col === 0 ? 'w-1/3' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}
