import { Database, Zap, ZapOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatMs, formatTime } from '@/lib/format';
import type { CacheMeta } from '@/lib/types';
import { cn } from '@/lib/utils';

const META = {
  HIT: { label: 'Cache', icon: Zap, className: 'text-success bg-success/10 ring-success/25' },
  MISS: { label: 'Banco', icon: Database, className: 'text-info bg-info/10 ring-info/25' },
  BYPASS: {
    label: 'Sem cache',
    icon: ZapOff,
    className: 'text-[oklch(0.45_0.11_65)] bg-warning/12 ring-warning/30',
  },
} as const;

/**
 * Mostra de onde veio a resposta (Redis ou PostgreSQL), quando foi calculada e
 * quanto tempo o servidor levou. Nada é estimado: os números vêm da API.
 */
export function CacheBadge({
  cache,
  className,
}: {
  cache: CacheMeta | undefined;
  className?: string;
}) {
  if (!cache) return null;
  const meta = META[cache.strategy];
  const Icon = meta.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset tabular',
            meta.className,
            className,
          )}
        >
          <Icon className="size-3" aria-hidden />
          {meta.label} · {formatMs(cache.durationMs)}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-left">
        <div className="space-y-1 text-xs">
          <p className="font-medium">
            {cache.strategy === 'HIT'
              ? 'Servido pelo Redis'
              : cache.strategy === 'MISS'
                ? 'Calculado no PostgreSQL e guardado no Redis'
                : 'Redis indisponível: calculado direto no PostgreSQL'}
          </p>
          <p>Dados de {formatTime(cache.computedAt)}</p>
          {cache.sourceDurationMs != null && (
            <p>Consulta ao banco: {formatMs(cache.sourceDurationMs)}</p>
          )}
          {cache.ttlRemaining != null && (
            <p>
              Expira em {cache.ttlRemaining} s (TTL {cache.ttlSeconds} s)
            </p>
          )}
          <p className="font-mono text-[10px] break-all opacity-80">{cache.key}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
