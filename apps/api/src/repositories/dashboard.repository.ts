import { throwIfDbError } from '../lib/errors.js';
import type { Db } from '../lib/supabase.js';

export interface DashboardSummary {
  period: { from: string; to: string; days: number; timezone: string };
  previous_period: { from: string; to: string };
  kpis: {
    revenue: number;
    orders: number;
    paid_orders: number;
    pending_orders: number;
    pending_amount: number;
    canceled_orders: number;
    discounts: number;
    active_customers: number;
    average_ticket: number | null;
    items_sold: number;
    gross_profit: number;
    gross_margin: number | null;
  };
  previous: { revenue: number; orders: number; paid_orders: number; average_ticket: number | null };
  sales_by_day: Array<{ date: string; revenue: number; orders: number }>;
  top_products: Array<{
    product_id: string;
    name: string;
    sku: string;
    quantity: number;
    revenue: number;
  }>;
  low_stock: {
    count: number;
    items: Array<{
      id: string;
      name: string;
      sku: string;
      stock_quantity: number;
      min_stock: number;
      shortage: number;
    }>;
  };
  status_breakdown: Partial<Record<'pending' | 'paid' | 'completed' | 'canceled', number>>;
  generated_at: string;
}

export class DashboardRepository {
  constructor(private readonly db: Db) {}

  async summary(
    companyId: string,
    from: string,
    to: string,
    timezone: string,
  ): Promise<DashboardSummary> {
    const { data, error } = await this.db.rpc('dashboard_summary', {
      p_company_id: companyId,
      p_from: from,
      p_to: to,
      p_tz: timezone,
    });
    throwIfDbError(error);
    return data as unknown as DashboardSummary;
  }

  /** Consulta mínima, usada para medir a latência até o PostgreSQL. */
  async ping(companyId: string): Promise<void> {
    const { error } = await this.db
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .maybeSingle();
    throwIfDbError(error);
  }
}
