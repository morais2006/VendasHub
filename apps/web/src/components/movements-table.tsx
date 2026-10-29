import { Link } from 'react-router';
import { MovementBadge } from '@/components/badges';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime, formatInt } from '@/lib/format';
import type { StockMovement } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Histórico de movimentações (trilha de auditoria do estoque). */
export function MovementsTable({
  items,
  showProduct,
}: {
  items: StockMovement[];
  showProduct: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Data</TableHead>
          {showProduct && <TableHead>Produto</TableHead>}
          <TableHead>Tipo</TableHead>
          <TableHead className="text-right">Qtd.</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead className="hidden md:table-cell">Origem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((movement) => (
          <TableRow key={movement.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground tabular">
              {formatDateTime(movement.created_at)}
            </TableCell>
            {showProduct && (
              <TableCell className="max-w-56">
                <Link
                  to={`/produtos/${movement.product_id}`}
                  className="block truncate hover:underline"
                >
                  {movement.product?.name ?? '—'}
                </Link>
              </TableCell>
            )}
            <TableCell>
              <MovementBadge type={movement.type} />
            </TableCell>
            <TableCell
              className={cn(
                'text-right font-medium tabular',
                movement.quantity > 0 ? 'text-success' : 'text-foreground',
              )}
            >
              {movement.quantity > 0 ? '+' : '−'}
              {formatInt(Math.abs(movement.quantity))}
            </TableCell>
            <TableCell className="text-right tabular">
              {formatInt(movement.balance_after)}
            </TableCell>
            <TableCell className="hidden max-w-64 text-sm md:table-cell">
              {movement.order_id && movement.order ? (
                <Link to={`/pedidos/${movement.order_id}`} className="hover:underline">
                  Pedido #{movement.order.number}
                </Link>
              ) : (
                <span className="block truncate text-muted-foreground">
                  {movement.reason ?? '—'}
                </span>
              )}
              {movement.author && (
                <span className="block text-xs text-muted-foreground">
                  por {movement.author.full_name}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
