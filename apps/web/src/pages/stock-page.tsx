import { ArrowLeftRight } from 'lucide-react';
import { MOVEMENT_TYPE } from '@/lib/labels';
import { FilterTabs, Pagination } from '@/components/list-controls';
import { MovementsTable } from '@/components/movements-table';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { Card } from '@/components/ui/card';
import { useMovements } from '@/hooks/use-api';
import { useListParams } from '@/hooks/use-list-params';
import type { MovementType } from '@/lib/types';
import { cn } from '@/lib/utils';

const DEFAULTS = { type: 'all' };
const TYPE_OPTIONS: Array<{ value: MovementType | 'all'; label: string }> = [
  { value: 'all', label: 'Todas' },
  ...(Object.keys(MOVEMENT_TYPE) as MovementType[]).map((type) => ({
    value: type,
    label: MOVEMENT_TYPE[type].label,
  })),
];

export default function StockPage() {
  const [params, update] = useListParams(DEFAULTS);
  const query = useMovements({
    type: params.type === 'all' ? undefined : params.type,
    page: params.page,
    page_size: 25,
  });
  const data = query.data;

  return (
    <>
      <PageHeader
        title="Movimentações de estoque"
        description="Toda entrada e saída fica registrada com saldo, origem e responsável."
      />
      <Card className="gap-0 py-0">
        <div className="max-w-full overflow-x-auto border-b p-3">
          <FilterTabs
            label="Tipo"
            value={params.type as MovementType | 'all'}
            options={TYPE_OPTIONS}
            onChange={(type) => update({ type })}
          />
        </div>
        {query.isError && !data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} className="m-3" />
        ) : !data ? (
          <TableSkeleton />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<ArrowLeftRight />} title="Nenhuma movimentação encontrada" />
        ) : (
          <div className={cn(query.isPlaceholderData && 'opacity-60')}>
            <MovementsTable items={data.items} showProduct />
            <Pagination
              page={data.page}
              totalPages={data.total_pages}
              total={data.total}
              noun="movimentações"
              onPage={(page) => update({ page })}
            />
          </div>
        )}
      </Card>
    </>
  );
}
