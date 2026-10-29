import { Link, useNavigate } from 'react-router';
import { OrderStatusBadge } from '@/components/badges';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatInt, formatMoney } from '@/lib/format';
import type { OrderListItem } from '@/lib/types';

export function OrdersTable({
  items,
  showCustomer = true,
}: {
  items: OrderListItem[];
  showCustomer?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Pedido</TableHead>
          <TableHead className="hidden sm:table-cell">Data</TableHead>
          {showCustomer && <TableHead className="hidden md:table-cell">Cliente</TableHead>}
          <TableHead className="hidden text-right lg:table-cell">Itens</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((order) => (
          <TableRow
            key={order.id}
            className="cursor-pointer"
            onClick={() => navigate(`/pedidos/${order.id}`)}
          >
            <TableCell>
              <Link
                to={`/pedidos/${order.id}`}
                onClick={(e) => e.stopPropagation()}
                className="font-medium tabular hover:underline"
              >
                #{order.number}
              </Link>
              <span className="block text-xs text-muted-foreground tabular sm:hidden">
                {formatDateTime(order.created_at)}
              </span>
            </TableCell>
            <TableCell className="hidden whitespace-nowrap text-muted-foreground tabular sm:table-cell">
              {formatDateTime(order.created_at)}
            </TableCell>
            {showCustomer && (
              <TableCell className="hidden max-w-56 md:table-cell">
                <span className="block truncate">
                  {order.customer?.name ?? (
                    <span className="text-muted-foreground">Consumidor final</span>
                  )}
                </span>
              </TableCell>
            )}
            <TableCell className="hidden text-right tabular lg:table-cell">
              {formatInt(order.items[0]?.count ?? 0)}
            </TableCell>
            <TableCell>
              <OrderStatusBadge status={order.status} />
            </TableCell>
            <TableCell className="text-right font-medium tabular">
              {formatMoney(order.total)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
