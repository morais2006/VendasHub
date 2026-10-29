import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatInt } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Campo de busca com atraso (evita uma requisição por tecla). */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  label = 'Buscar',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);

  // Valor externo mudou (ex.: "limpar filtros"): o rascunho acompanha.
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className="h-9 pr-8 pl-8"
      />
      {draft && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => {
            setDraft('');
            onChange('');
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
  noun = 'registros',
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
  noun?: string;
}) {
  return (
    <nav
      aria-label="Paginação"
      className="flex items-center justify-between gap-3 border-t px-3 py-2.5 text-sm text-muted-foreground"
    >
      <span className="tabular">
        {formatInt(total)} {noun}
      </span>
      <div className="flex items-center gap-1">
        <span className="mr-2 tabular">
          Página {page} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Próxima página"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

/** Cabeçalho de coluna ordenável (acessível por teclado). */
export function SortHeader({
  label,
  column,
  sort,
  order,
  onSort,
  className,
}: {
  label: string;
  column: string;
  sort: string;
  order: 'asc' | 'desc';
  onSort: (column: string) => void;
  className?: string;
}) {
  const active = sort === column;
  const Icon = order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      aria-label={`Ordenar por ${label}${active ? (order === 'asc' ? ' (crescente)' : ' (decrescente)') : ''}`}
      className={cn(
        'inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        active && 'text-foreground',
        className,
      )}
    >
      {label}
      {active && <Icon className="size-3" aria-hidden />}
    </button>
  );
}

/** Abas de filtro compactas. */
export function FilterTabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          role="tab"
          type="button"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
            value === option.value && 'bg-card font-medium text-foreground shadow-xs',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
