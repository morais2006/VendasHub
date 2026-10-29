import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CustomerDetail,
  CustomerSummary,
  DashboardSummary,
  Diagnostics,
  OrderDetail,
  OrderListItem,
  Page,
  Product,
  StockMovement,
} from '@/lib/types';
import { useActiveCompany } from '@/providers/company-provider';

type Params = Record<string, string | number | boolean | null | undefined>;
type CacheTagged = { cache: import('@/lib/types').CacheMeta };

/** Consulta da empresa ativa: a chave inclui a empresa e os filtros. */
function useCompanyQuery<T>(
  resource: string,
  path: string,
  params?: Params,
  options?: Partial<UseQueryOptions<T>>,
) {
  const { id } = useActiveCompany();
  return useQuery<T>({
    queryKey: [resource, id, path, params ?? {}],
    queryFn: ({ signal }) => api<T>(path, { query: params, signal }),
    ...options,
  });
}

export const useDashboard = (params: { from: string; to: string }) =>
  useCompanyQuery<DashboardSummary>('dashboard', '/dashboard', params, {
    placeholderData: keepPreviousData,
  });

export const useProducts = (params: Params) =>
  useCompanyQuery<Page<Product> & CacheTagged>('products', '/products', params, {
    placeholderData: keepPreviousData,
  });

export const useProduct = (id: string) => useCompanyQuery<Product>('products', `/products/${id}`);

export const useMovements = (params: Params) =>
  useCompanyQuery<Page<StockMovement>>('stock', '/stock/movements', params, {
    placeholderData: keepPreviousData,
  });

export const useCustomers = (params: Params) =>
  useCompanyQuery<Page<CustomerSummary>>('customers', '/customers', params, {
    placeholderData: keepPreviousData,
  });

export const useCustomer = (id: string, enabled = true) =>
  useCompanyQuery<CustomerDetail>('customers', `/customers/${id}`, undefined, {
    enabled: enabled && Boolean(id),
  });

export const useOrders = (params: Params) =>
  useCompanyQuery<Page<OrderListItem>>('orders', '/orders', params, {
    placeholderData: keepPreviousData,
  });

export const useOrder = (id: string) => useCompanyQuery<OrderDetail>('orders', `/orders/${id}`);

export const useDiagnostics = (refetchInterval: number | false) =>
  useCompanyQuery<Diagnostics>('diagnostics', '/system/diagnostics', undefined, {
    refetchInterval,
  });

/**
 * Mutação que, ao terminar, marca como desatualizadas as consultas afetadas.
 * O cache do Redis é invalidado no servidor; aqui só atualizamos a tela.
 */
export function useApiMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  affects: readonly string[],
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all(
        [...affects, 'diagnostics'].map((resource) =>
          queryClient.invalidateQueries({ queryKey: [resource] }),
        ),
      ),
  });
}
