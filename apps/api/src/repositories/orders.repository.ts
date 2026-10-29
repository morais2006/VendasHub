import { startOfDayIso, addDays } from '../lib/dates.js';
import { throwIfDbError } from '../lib/errors.js';
import type { Db } from '../lib/supabase.js';
import { pageRange, toPage, type Page } from '../schemas/common.js';
import type { OrderCreateInput, OrderListQuery } from '../schemas/orders.js';
import type { Enums, Tables } from '../types/database.types.js';

export type OrderStatus = Enums<'order_status'>;

export interface OrderListItem {
  id: string;
  number: number;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  created_at: string;
  customer: { id: string; name: string } | null;
  items: Array<{ count: number }>;
}

export interface OrderDetail extends Omit<Tables<'orders'>, 'idempotency_key'> {
  customer: { id: string; name: string; email: string | null; phone: string | null } | null;
  author: { full_name: string } | null;
  canceler: { full_name: string } | null;
  items: Array<
    Pick<
      Tables<'order_items'>,
      | 'id'
      | 'product_id'
      | 'product_name'
      | 'product_sku'
      | 'quantity'
      | 'unit_price'
      | 'line_total'
    >
  >;
}

export interface OrderMutationResult {
  id: string;
  number: number;
  status: OrderStatus;
  subtotal?: number;
  discount?: number;
  total?: number;
  replayed?: boolean;
}

const CUSTOMER_FK = 'customers!orders_customer_id_company_id_fkey';

export class OrdersRepository {
  constructor(private readonly db: Db) {}

  async list(
    companyId: string,
    query: OrderListQuery,
    timezone: string,
  ): Promise<Page<OrderListItem>> {
    const [from, to] = pageRange(query.page, query.page_size);
    let request = this.db
      .from('orders')
      .select(
        `id, number, status, subtotal, discount, total, created_at, customer:${CUSTOMER_FK}(id, name), items:order_items(count)`,
        { count: 'exact' },
      )
      .eq('company_id', companyId);

    if (query.status) request = request.eq('status', query.status);
    if (query.customer_id) request = request.eq('customer_id', query.customer_id);
    if (query.number) request = request.eq('number', query.number);
    if (query.from) request = request.gte('created_at', startOfDayIso(query.from, timezone));
    if (query.to) request = request.lt('created_at', startOfDayIso(addDays(query.to, 1), timezone));

    const { data, count, error } = await request
      .order('created_at', { ascending: false })
      .order('number', { ascending: false })
      .range(from, to);
    throwIfDbError(error);
    return toPage(
      (data ?? []) as unknown as OrderListItem[],
      count ?? 0,
      query.page,
      query.page_size,
    );
  }

  async get(companyId: string, id: string): Promise<OrderDetail> {
    const { data, error } = await this.db
      .from('orders')
      .select(
        'id, company_id, number, customer_id, status, subtotal, discount, total, notes, created_by, ' +
          'created_at, updated_at, paid_at, completed_at, canceled_at, canceled_by, cancel_reason, ' +
          `customer:${CUSTOMER_FK}(id, name, email, phone), ` +
          'author:profiles!orders_created_by_fkey(full_name), ' +
          'canceler:profiles!orders_canceled_by_fkey(full_name), ' +
          'items:order_items(id, product_id, product_name, product_sku, quantity, unit_price, line_total)',
      )
      .eq('company_id', companyId)
      .eq('id', id)
      .single();
    throwIfDbError(error);
    return data as unknown as OrderDetail;
  }

  async create(companyId: string, input: OrderCreateInput, idempotencyKey: string) {
    const { data, error } = await this.db.rpc('create_order', {
      p_company_id: companyId,
      p_items: input.items,
      p_idempotency_key: idempotencyKey,
      p_discount: input.discount,
      p_status: input.status,
      ...(input.customer_id ? { p_customer_id: input.customer_id } : {}),
      ...(input.notes ? { p_notes: input.notes } : {}),
    });
    throwIfDbError(error);
    return data as unknown as OrderMutationResult;
  }

  async setStatus(id: string, status: 'paid' | 'completed') {
    const { data, error } = await this.db.rpc('set_order_status', {
      p_order_id: id,
      p_status: status,
    });
    throwIfDbError(error);
    return data as unknown as OrderMutationResult & { company_id: string };
  }

  async cancel(id: string, reason: string) {
    const { data, error } = await this.db.rpc('cancel_order', { p_order_id: id, p_reason: reason });
    throwIfDbError(error);
    return data as unknown as OrderMutationResult & { company_id: string };
  }
}
