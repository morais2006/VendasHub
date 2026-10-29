import { Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog';
import { FilterTabs, Pagination, SearchInput, SortHeader } from '@/components/list-controls';
import { PageHeader } from '@/components/page-header';
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
import { useCustomers } from '@/hooks/use-api';
import { nextSort, useListParams } from '@/hooks/use-list-params';
import { formatDate, formatInt, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const DEFAULTS = { search: '', status: 'active', sort: 'name', order: 'asc' };
type Status = 'active' | 'archived' | 'all';

export default function CustomersPage() {
  const navigate = useNavigate();
  const [params, update] = useListParams(DEFAULTS);
  const [creating, setCreating] = useState(false);
  const query = useCustomers({ ...params, page_size: 20 });
  const data = query.data;

  const onSort = (column: string) => {
    const next = nextSort(params, column);
    // Valores e datas fazem mais sentido do maior para o menor na primeira vez.
    if (params.sort !== column && column !== 'name') next.order = 'desc';
    update(next);
  };
  const sortProps = { sort: params.sort, order: params.order as 'asc' | 'desc', onSort };

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cadastro e histórico de relacionamento."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Novo cliente
          </Button>
        }
      />

      <Card className="gap-0 py-0">
        <div className="flex flex-col gap-3 border-b p-3 md:flex-row md:items-center md:justify-between">
          <FilterTabs
            label="Situação"
            value={params.status as Status}
            options={[
              { value: 'active', label: 'Ativos' },
              { value: 'archived', label: 'Arquivados' },
              { value: 'all', label: 'Todos' },
            ]}
            onChange={(status) => update({ status })}
          />
          <SearchInput
            value={params.search}
            onChange={(search) => update({ search })}
            placeholder="Buscar por nome, e-mail ou telefone"
            className="md:w-80"
          />
        </div>

        {query.isError && !data ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} className="m-3" />
        ) : !data ? (
          <TableSkeleton />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={params.search ? 'Nenhum cliente encontrado' : 'Nenhum cliente nesta lista'}
            action={
              !params.search && (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus /> Cadastrar cliente
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
                    <SortHeader label="Cliente" column="name" {...sortProps} />
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Contato</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Pedidos</TableHead>
                  <TableHead className="text-right">
                    <SortHeader label="Total comprado" column="total_spent" {...sortProps} />
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    <SortHeader label="Última compra" column="last_order" {...sortProps} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/clientes/${customer.id}`)}
                  >
                    <TableCell className="max-w-64">
                      <Link
                        to={`/clientes/${customer.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate font-medium hover:underline"
                      >
                        {customer.name}
                      </Link>
                      {customer.archived_at && (
                        <span className="text-xs text-muted-foreground">Arquivado</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-60 text-sm text-muted-foreground md:table-cell">
                      {customer.email && <span className="block truncate">{customer.email}</span>}
                      {customer.phone && <span className="block">{customer.phone}</span>}
                      {!customer.email && !customer.phone && '—'}
                    </TableCell>
                    <TableCell className="hidden text-right tabular sm:table-cell">
                      {formatInt(customer.orders_count)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular">
                      {formatMoney(customer.total_spent)}
                    </TableCell>
                    <TableCell className="hidden text-right text-muted-foreground tabular lg:table-cell">
                      {customer.last_order_at
                        ? formatDate(customer.last_order_at)
                        : 'Nunca comprou'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              page={data.page}
              totalPages={data.total_pages}
              total={data.total}
              noun="clientes"
              onPage={(page) => update({ page })}
            />
          </div>
        )}
      </Card>

      <CustomerFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(customer) => navigate(`/clientes/${customer.id}`)}
      />
    </>
  );
}
