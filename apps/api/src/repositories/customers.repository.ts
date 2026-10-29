import { throwIfDbError } from '../lib/errors.js';
import type { Db } from '../lib/supabase.js';
import { ilikeAny } from '../lib/validation.js';
import { pageRange, toPage, type Page } from '../schemas/common.js';
import type {
  CustomerCreateInput,
  CustomerListQuery,
  CustomerUpdateInput,
} from '../schemas/customers.js';
import type { Database } from '../types/database.types.js';

export type CustomerSummary = Database['public']['Views']['customer_summaries']['Row'];

export interface CustomerInsights {
  orders_count: number;
  canceled_count: number;
  total_spent: number;
  pending_amount: number;
  average_ticket: number | null;
  first_order_at: string | null;
  last_order_at: string | null;
  days_since_last_order: number | null;
  top_products: Array<{ product_id: string; name: string; quantity: number; revenue: number }>;
}

const SORT_COLUMNS = {
  name: 'name',
  total_spent: 'total_spent',
  last_order: 'last_order_at',
  created: 'created_at',
} as const;

export class CustomersRepository {
  constructor(private readonly db: Db) {}

  async list(companyId: string, query: CustomerListQuery): Promise<Page<CustomerSummary>> {
    const [from, to] = pageRange(query.page, query.page_size);
    let request = this.db
      .from('customer_summaries')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId);

    if (query.status === 'active') request = request.is('archived_at', null);
    if (query.status === 'archived') request = request.not('archived_at', 'is', null);
    if (query.search) request = request.or(ilikeAny(['name', 'email', 'phone'], query.search));

    const { data, count, error } = await request
      .order(SORT_COLUMNS[query.sort], {
        ascending: query.order === 'asc',
        nullsFirst: false,
      })
      .order('id')
      .range(from, to);
    throwIfDbError(error);
    return toPage(data ?? [], count ?? 0, query.page, query.page_size);
  }

  async get(companyId: string, id: string): Promise<CustomerSummary> {
    const { data, error } = await this.db
      .from('customer_summaries')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', id)
      .single();
    throwIfDbError(error);
    return data!;
  }

  async insights(id: string): Promise<CustomerInsights> {
    const { data, error } = await this.db.rpc('customer_insights', { p_customer_id: id });
    throwIfDbError(error);
    return data as unknown as CustomerInsights;
  }

  async create(companyId: string, input: CustomerCreateInput): Promise<string> {
    const { data, error } = await this.db
      .from('customers')
      .insert({ company_id: companyId, ...input })
      .select('id')
      .single();
    throwIfDbError(error);
    return data!.id;
  }

  async update(companyId: string, id: string, input: CustomerUpdateInput): Promise<void> {
    // .single() transforma "nenhuma linha afetada" (inexistente ou bloqueada pelo RLS) em 404.
    const { error } = await this.db
      .from('customers')
      .update(input)
      .eq('company_id', companyId)
      .eq('id', id)
      .select('id')
      .single();
    throwIfDbError(error);
  }

  async setArchived(companyId: string, id: string, archived: boolean): Promise<void> {
    const { error } = await this.db
      .from('customers')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('company_id', companyId)
      .eq('id', id)
      .select('id')
      .single();
    throwIfDbError(error);
  }
}
