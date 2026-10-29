import { Package, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Pill, StockBadge } from '@/components/badges';
import { CacheBadge } from '@/components/cache-badge';
import { FilterTabs, Pagination, SearchInput, SortHeader } from '@/components/list-controls';
import { PageHeader } from '@/components/page-header';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProducts } from '@/hooks/use-api';
import { nextSort, useListParams } from '@/hooks/use-list-params';
import { formatInt, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { canManage, useActiveCompany } from '@/providers/company-provider';

const DEFAULTS = { search: '', status: 'active', sort: 'name', order: 'asc' };
type Status = 'active' | 'low' | 'archived' | 'all';

const STATUS_OPTIONS: Array<{ value: Status; label: string }> = [
  { value: 'active', label: 'Ativos' },
  { value: 'low', label: 'Estoque baixo' },
  { value: 'archived', label: 'Arquivados' },
  { value: 'all', label: 'Todos' },
];

export default function ProductsPage() {
  const company = useActiveCompany();
  const navigate = useNavigate();
  const [params, update] = useListParams(DEFAULTS);
  const [creating, setCreating] = useState(false);
  const query = useProducts({ ...params, page_size: 20 });
  const data = query.data;

  const onSort = (column: string) => update(nextSort(params, column));
  const sortProps = { sort: params.sort, order: params.order as 'asc' | 'desc', onSort };

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Catálogo, preços e saldo de estoque."
        meta={<CacheBadge cache={data?.cache} />}
        actions={
          canManage(company.role) && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Novo produto
            </Button>
          )
        }
      />

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-3 md:flex-row md:items-center md:justify-between">
          <div className="max-w-full overflow-x-auto">
            <FilterTabs
              label="Situação"
              value={params.status as Status}
              options={STATUS_OPTIONS}
              onChange={(status) => update({ status })}
            />
          </div>
          <SearchInput
            value={params.search}
            onChange={(search) => update({ search })}
            placeholder="Buscar por nome ou SKU"
            className="md:w-72"
          />
        </div>

        {query.isError && !data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} className="m-3" />
        ) : !data ? (
          <TableSkeleton />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title={params.search ? 'Nenhum produto encontrado' : 'Nenhum produto nesta lista'}
            description={params.search ? `Nada corresponde a "${params.search}".` : undefined}
            action={
              canManage(company.role) &&
              !params.search && (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus /> Cadastrar produto
                </Button>
              )
            }
          />
        ) : (
          <div className={cn(query.isPlaceholderData && 'opacity-60')}>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>
                    <SortHeader label="Produto" column="name" {...sortProps} />
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    <SortHeader label="SKU" column="sku" {...sortProps} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortHeader label="Preço" column="price" {...sortProps} />
                  </TableHead>
                  <TableHead className="hidden text-right md:table-cell">Custo</TableHead>
                  <TableHead className="text-right">
                    <SortHeader label="Estoque" column="stock" {...sortProps} />
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((product) => (
                  <TableRow
                    key={product.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/produtos/${product.id}`)}
                  >
                    <TableCell className="max-w-72">
                      <Link
                        to={`/produtos/${product.id}`}
                        className="block truncate font-medium hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {product.name}
                      </Link>
                      <span className="text-xs text-muted-foreground sm:hidden">{product.sku}</span>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs sm:table-cell">
                      {product.sku}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatMoney(product.price)}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular md:table-cell">
                      {formatMoney(product.cost)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      <span
                        className={cn(
                          product.is_low_stock && !product.archived_at && 'font-semibold',
                        )}
                      >
                        {formatInt(product.stock_quantity)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        mín. {formatInt(product.min_stock)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {product.archived_at ? (
                        <Pill>Arquivado</Pill>
                      ) : (
                        <StockBadge quantity={product.stock_quantity} min={product.min_stock} />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={data.page}
              totalPages={data.total_pages}
              total={data.total}
              noun="produtos"
              onPage={(page) => update({ page })}
            />
          </div>
        )}
      </Card>

      <ProductFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(product) => navigate(`/produtos/${product.id}`)}
      />
    </>
  );
}
