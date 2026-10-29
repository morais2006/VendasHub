import { Plus, Receipt, X } from 'lucide-react';
import { Link } from 'react-router';
import { FilterTabs, Pagination, SearchInput } from '@/components/list-controls';
import { OrdersTable } from '@/components/orders-table';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOrders } from '@/hooks/use-api';
import { useListParams } from '@/hooks/use-list-params';
import type { OrderStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const DEFAULTS = { status: 'all', from: '', to: '', number: '', customer_id: '' };
const STATUS_OPTIONS: Array<{ value: OrderStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'paid', label: 'Pagos' },
  { value: 'completed', label: 'Concluídos' },
  { value: 'canceled', label: 'Cancelados' },
];

export default function OrdersPage() {
  const [params, update] = useListParams(DEFAULTS);
  const query = useOrders({
    status: params.status === 'all' ? undefined : params.status,
    from: params.from,
    to: params.to,
    number: /^\d+$/.test(params.number) ? params.number : undefined,
    customer_id: params.customer_id,
    page: params.page,
    page_size: 20,
  });
  const data = query.data;
  const filtered = Boolean(
    params.from || params.to || params.number || params.customer_id || params.status !== 'all',
  );

  return (
    <>
      <PageHeader
        title="Vendas"
        description="Pedidos registrados, do mais recente ao mais antigo."
        actions={
          <Button asChild>
            <Link to="/pedidos/novo">
              <Plus /> Nova venda
            </Link>
          </Button>
        }
      />

      <Card className="gap-0 py-0">
        <div className="space-y-3 border-b p-3">
          <div className="max-w-full overflow-x-auto">
            <FilterTabs
              label="Status"
              value={params.status as OrderStatus | 'all'}
              options={STATUS_OPTIONS}
              onChange={(status) => update({ status })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={params.number}
              onChange={(number) => update({ number: number.replace(/\D/g, '') })}
              placeholder="Nº do pedido"
              label="Buscar pelo número do pedido"
              className="w-40"
            />
            <div className="flex items-center gap-2 text-sm">
              <Input
                type="date"
                aria-label="De"
                value={params.from}
                max={params.to || undefined}
                onChange={(e) => update({ from: e.target.value })}
                className="h-9 w-auto"
              />
              <span className="text-muted-foreground">até</span>
              <Input
                type="date"
                aria-label="Até"
                value={params.to}
                min={params.from || undefined}
                onChange={(e) => update({ to: e.target.value })}
                className="h-9 w-auto"
              />
            </div>
            {params.customer_id && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground">
                Filtrando por cliente
                <button
                  type="button"
                  aria-label="Remover filtro de cliente"
                  onClick={() => update({ customer_id: '' })}
                >
                  <X className="size-3" />
                </button>
              </span>
            )}
            {filtered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  update({ status: 'all', from: '', to: '', number: '', customer_id: '' })
                }
              >
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        {query.isError && !data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} className="m-3" />
        ) : !data ? (
          <TableSkeleton />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title={filtered ? 'Nenhum pedido com esses filtros' : 'Nenhuma venda registrada ainda'}
            action={
              !filtered && (
                <Button asChild size="sm">
                  <Link to="/pedidos/novo">
                    <Plus /> Registrar a primeira venda
                  </Link>
                </Button>
              )
            }
          />
        ) : (
          <div className={cn(query.isPlaceholderData && 'opacity-60')}>
            <OrdersTable items={data.items} />
            <Pagination
              page={data.page}
              totalPages={data.total_pages}
              total={data.total}
              noun="pedidos"
              onPage={(page) => update({ page })}
            />
          </div>
        )}
      </Card>
    </>
  );
}
