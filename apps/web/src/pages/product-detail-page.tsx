import { Archive, ArchiveRestore, ArrowLeft, ArrowLeftRight, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Pill, StockBadge } from '@/components/badges';
import { Pagination } from '@/components/list-controls';
import { MovementsTable } from '@/components/movements-table';
import { PageHeader } from '@/components/page-header';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { StockAdjustDialog } from '@/components/products/stock-adjust-dialog';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states';
import { errorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiMutation, useMovements, useProduct } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { formatDate, formatInt, formatMoney, formatPercent } from '@/lib/format';
import type { Product } from '@/lib/types';
import { canManage, useActiveCompany } from '@/providers/company-provider';

export default function ProductDetailPage() {
  const { id = '' } = useParams();
  const company = useActiveCompany();
  const manager = canManage(company.role);
  const [editing, setEditing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [page, setPage] = useState(1);
  const product = useProduct(id);
  const movements = useMovements({ product_id: id, page, page_size: 15 });

  const archive = useApiMutation(
    (archived: boolean) =>
      api<Product>(`/products/${id}/${archived ? 'archive' : 'restore'}`, { method: 'POST' }),
    ['products', 'dashboard'],
  );

  if (product.isError)
    return (
      <>
        <BackLink />
        <ErrorState error={product.error} onRetry={() => void product.refetch()} />
      </>
    );
  if (!product.data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );

  const p = product.data;
  const margin = p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : null;

  async function toggleArchive() {
    try {
      await archive.mutateAsync(!p.archived_at);
      toast.success(p.archived_at ? 'Produto restaurado' : 'Produto arquivado');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <BackLink />
      <PageHeader
        title={p.name}
        description={
          <span className="font-mono text-xs">
            SKU {p.sku} · cadastrado em {formatDate(p.created_at)}
          </span>
        }
        meta={
          p.archived_at ? (
            <Pill>Arquivado</Pill>
          ) : (
            <StockBadge quantity={p.stock_quantity} min={p.min_stock} />
          )
        }
        actions={
          manager && (
            <>
              {!p.archived_at && (
                <Button variant="outline" onClick={() => setAdjusting(true)}>
                  <ArrowLeftRight /> Movimentar
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Editar
              </Button>
              <Button
                variant="ghost"
                onClick={() => void toggleArchive()}
                disabled={archive.isPending}
              >
                {p.archived_at ? <ArchiveRestore /> : <Archive />}
                {p.archived_at ? 'Restaurar' : 'Arquivar'}
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-sm text-muted-foreground">Em estoque</p>
            <p className="text-2xl font-semibold">{formatInt(p.stock_quantity)} un.</p>
            <p className="text-xs text-muted-foreground">mínimo {formatInt(p.min_stock)}</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-sm text-muted-foreground">Preço de venda</p>
            <p className="text-2xl font-semibold">{formatMoney(p.price)}</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-sm text-muted-foreground">Custo</p>
            <p className="text-2xl font-semibold">{formatMoney(p.cost)}</p>
            <p className="text-xs text-muted-foreground">margem de {formatPercent(margin)}</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-sm text-muted-foreground">Valor em estoque (custo)</p>
            <p className="text-2xl font-semibold">{formatMoney(p.cost * p.stock_quantity)}</p>
          </CardContent>
        </Card>
      </div>

      {p.description && <p className="max-w-3xl text-sm text-muted-foreground">{p.description}</p>}

      <Card className="gap-0 pb-0">
        <CardHeader className="pb-3">
          <CardTitle>Histórico de movimentações</CardTitle>
        </CardHeader>
        {movements.isError ? (
          <ErrorState error={movements.error} className="m-4" />
        ) : !movements.data ? (
          <TableSkeleton rows={4} />
        ) : movements.data.items.length === 0 ? (
          <EmptyState title="Nenhuma movimentação registrada" />
        ) : (
          <>
            <MovementsTable items={movements.data.items} showProduct={false} />
            <Pagination
              page={movements.data.page}
              totalPages={movements.data.total_pages}
              total={movements.data.total}
              noun="movimentações"
              onPage={setPage}
            />
          </>
        )}
      </Card>

      <ProductFormDialog open={editing} onOpenChange={setEditing} product={p} />
      <StockAdjustDialog product={p} open={adjusting} onOpenChange={setAdjusting} />
    </>
  );
}

function BackLink() {
  return (
    <Link
      to="/produtos"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Produtos
    </Link>
  );
}
