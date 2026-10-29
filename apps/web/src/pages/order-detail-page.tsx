import { ArrowLeft, Ban, CheckCheck, CircleDollarSign, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { OrderStatusBadge } from '@/components/badges';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/states';
import { errorMessage } from '@/lib/error-message';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useApiMutation, useOrder } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { formatDateTime, formatInt, formatMoney } from '@/lib/format';
import type { OrderDetail } from '@/lib/types';
import { cn } from '@/lib/utils';
import { canManage, useActiveCompany } from '@/providers/company-provider';

const AFFECTS = ['orders', 'dashboard', 'customers'] as const;

function Timeline({ order }: { order: OrderDetail }) {
  const steps = [
    { label: 'Pedido registrado', at: order.created_at, by: order.author?.full_name },
    { label: 'Pagamento confirmado', at: order.paid_at },
    { label: 'Concluído', at: order.completed_at },
    ...(order.canceled_at
      ? [
          {
            label: 'Cancelado — estoque devolvido',
            at: order.canceled_at,
            by: order.canceler?.full_name,
            note: order.cancel_reason,
            danger: true,
          },
        ]
      : []),
  ];
  return (
    <ol className="space-y-4">
      {steps.map((step) => (
        <li key={step.label} className="flex gap-3">
          <span
            className={cn(
              'mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-card',
              !step.at
                ? 'bg-border'
                : 'danger' in step && step.danger
                  ? 'bg-destructive'
                  : 'bg-primary',
            )}
            aria-hidden
          />
          <div className="text-sm">
            <p className={cn('font-medium', !step.at && 'text-muted-foreground')}>{step.label}</p>
            <p className="text-xs text-muted-foreground tabular">
              {step.at ? formatDateTime(step.at) : 'Ainda não'}
              {'by' in step && step.by ? ` · ${step.by}` : ''}
            </p>
            {'note' in step && step.note && <p className="mt-1 text-xs">Motivo: {step.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function OrderDetailPage() {
  const { id = '' } = useParams();
  const company = useActiveCompany();
  const query = useOrder(id);
  const [canceling, setCanceling] = useState(false);
  const [reason, setReason] = useState('');

  const statusMutation = useApiMutation(
    (status: 'paid' | 'completed') =>
      api(`/orders/${id}/status`, { method: 'POST', body: { status } }),
    AFFECTS,
  );
  const cancelMutation = useApiMutation(
    () => api(`/orders/${id}/cancel`, { method: 'POST', body: { reason: reason.trim() } }),
    [...AFFECTS, 'products', 'stock'],
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
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );

  const order = query.data;
  const open = order.status === 'pending' || order.status === 'paid';

  async function advance(status: 'paid' | 'completed') {
    try {
      await statusMutation.mutateAsync(status);
      toast.success(status === 'paid' ? 'Pagamento confirmado' : 'Pedido concluído');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function cancel() {
    try {
      await cancelMutation.mutateAsync();
      toast.success('Pedido cancelado e estoque devolvido');
      setCanceling(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <BackLink />
      <PageHeader
        title={`Pedido #${order.number}`}
        meta={<OrderStatusBadge status={order.status} />}
        description={`Registrado em ${formatDateTime(order.created_at)}`}
        actions={
          <>
            {order.status === 'pending' && (
              <Button onClick={() => void advance('paid')} disabled={statusMutation.isPending}>
                <CircleDollarSign /> Confirmar pagamento
              </Button>
            )}
            {open && (
              <Button
                variant={order.status === 'paid' ? 'default' : 'outline'}
                onClick={() => void advance('completed')}
                disabled={statusMutation.isPending}
              >
                <CheckCheck /> Concluir
              </Button>
            )}
            {open && canManage(company.role) && (
              <Button variant="destructive" onClick={() => setCanceling(true)}>
                <Ban /> Cancelar
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-0 pb-0 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Itens</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Preço un.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-64">
                    <Link
                      to={`/produtos/${item.product_id}`}
                      className="block truncate hover:underline"
                    >
                      {item.product_name}
                    </Link>
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.product_sku}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular">{formatInt(item.quantity)}</TableCell>
                  <TableCell className="hidden text-right tabular sm:table-cell">
                    {formatMoney(item.unit_price)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular">
                    {formatMoney(item.line_total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <dl className="ml-auto w-full max-w-xs space-y-1.5 border-t px-4 py-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular">{formatMoney(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Desconto</dt>
              <dd className="tabular">− {formatMoney(order.discount)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular">{formatMoney(order.total)}</dd>
            </div>
          </dl>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {order.customer ? (
                <div className="space-y-0.5">
                  <Link
                    to={`/clientes/${order.customer.id}`}
                    className="font-medium hover:underline"
                  >
                    {order.customer.name}
                  </Link>
                  {order.customer.email && (
                    <p className="text-muted-foreground">{order.customer.email}</p>
                  )}
                  {order.customer.phone && (
                    <p className="text-muted-foreground">{order.customer.phone}</p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Consumidor final (sem identificação)</p>
              )}
              {order.notes && <p className="mt-3 border-t pt-3">{order.notes}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Andamento</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline order={order} />
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={canceling} onOpenChange={setCanceling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o pedido #{order.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os {formatInt(order.items.reduce((sum, item) => sum + item.quantity, 0))} itens voltam
              para o estoque e o valor sai do faturamento. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Motivo</Label>
            <Textarea
              id="cancel-reason"
              rows={2}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: cliente desistiu da compra"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => void cancel()}
              disabled={cancelMutation.isPending || reason.trim().length < 3}
            >
              {cancelMutation.isPending && <Loader2 className="animate-spin" />}
              Cancelar pedido
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BackLink() {
  return (
    <Link
      to="/pedidos"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" /> Vendas
    </Link>
  );
}
