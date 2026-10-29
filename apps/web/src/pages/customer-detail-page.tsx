import { Archive, ArchiveRestore, ArrowLeft, Mail, Pencil, Phone, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Pill } from '@/components/badges';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { OrdersTable } from '@/components/orders-table';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState } from '@/components/states';
import { errorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiMutation, useCustomer } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { formatDate, formatInt, formatMoney, pluralize } from '@/lib/format';

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const [editing, setEditing] = useState(false);
  const query = useCustomer(id);
  const archive = useApiMutation(
    (archived: boolean) =>
      api(`/customers/${id}/${archived ? 'archive' : 'restore'}`, { method: 'POST' }),
    ['customers'],
  );

  if (query.isError)
    return (
      <>
        <BackLink />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  if (!query.data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
    );

  const customer = query.data;
  const insights = customer.insights;
  const recency =
    insights.days_since_last_order == null
      ? 'Ainda não comprou'
      : insights.days_since_last_order === 0
        ? 'Comprou hoje'
        : `há ${pluralize(insights.days_since_last_order, 'dia', 'dias')}`;

  async function toggleArchive() {
    try {
      await archive.mutateAsync(!customer.archived_at);
      toast.success(customer.archived_at ? 'Cliente restaurado' : 'Cliente arquivado');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <BackLink />
      <PageHeader
        title={customer.name}
        meta={customer.archived_at && <Pill>Arquivado</Pill>}
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {customer.email && (
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3.5" /> {customer.email}
              </span>
            )}
            {customer.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3.5" /> {customer.phone}
              </span>
            )}
            <span>Cliente desde {formatDate(customer.created_at)}</span>
          </span>
        }
        actions={
          <>
            {!customer.archived_at && (
              <Button asChild>
                <Link to={`/pedidos/novo?cliente=${customer.id}`}>
                  <Plus /> Nova venda
                </Link>
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
              {customer.archived_at ? <ArchiveRestore /> : <Archive />}
              {customer.archived_at ? 'Restaurar' : 'Arquivar'}
            </Button>
          </>
        }
      />

      <section
        aria-label="Indicadores do cliente"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <Metric
          label="Total comprado"
          value={formatMoney(insights.total_spent)}
          hint="pedidos pagos e concluídos"
        />
        <Metric
          label="Pedidos"
          value={formatInt(insights.orders_count)}
          hint={
            insights.canceled_count
              ? `${formatInt(insights.canceled_count)} cancelado(s)`
              : undefined
          }
        />
        <Metric label="Ticket médio" value={formatMoney(insights.average_ticket)} />
        <Metric
          label="Última compra"
          value={insights.last_order_at ? formatDate(insights.last_order_at) : '—'}
          hint={recency}
        />
      </section>

      {customer.notes && (
        <p className="max-w-3xl rounded-md border bg-card px-4 py-3 text-sm">
          <span className="font-medium">Observações: </span>
          {customer.notes}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-0 pb-0 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Pedidos recentes</CardTitle>
          </CardHeader>
          {customer.recent_orders.length === 0 ? (
            <EmptyState title="Nenhum pedido ainda" />
          ) : (
            <>
              <OrdersTable items={customer.recent_orders} showCustomer={false} />
              <div className="border-t px-3 py-2.5 text-sm">
                <Link
                  to={`/pedidos?customer_id=${customer.id}`}
                  className="text-primary hover:underline"
                >
                  Ver todos os pedidos do cliente
                </Link>
              </div>
            </>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Produtos preferidos</CardTitle>
          </CardHeader>
          <CardContent>
            {insights.top_products.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem compras pagas ainda.</p>
            ) : (
              <ul className="divide-y text-sm">
                {insights.top_products.map((product) => (
                  <li key={product.product_id} className="flex justify-between gap-3 py-2">
                    <Link
                      to={`/produtos/${product.product_id}`}
                      className="min-w-0 truncate hover:underline"
                    >
                      {product.name}
                    </Link>
                    <span className="shrink-0 text-muted-foreground tabular">
                      {formatInt(product.quantity)} un.
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <CustomerFormDialog open={editing} onOpenChange={setEditing} customer={customer} />
    </>
  );
}

function BackLink() {
  return (
    <Link
      to="/clientes"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Clientes
    </Link>
  );
}
