/** Formatos devolvidos pela API (mesmos nomes das colunas do banco). */

export type MemberRole = 'owner' | 'manager' | 'seller';
export type OrderStatus = 'pending' | 'paid' | 'completed' | 'canceled';
export type MovementType = 'initial' | 'purchase' | 'adjustment' | 'sale' | 'cancellation';
export type CacheStrategy = 'HIT' | 'MISS' | 'BYPASS';

export interface CacheMeta {
  strategy: CacheStrategy;
  namespace: 'dashboard' | 'catalog';
  key: string;
  ttlSeconds: number;
  ttlRemaining: number | null;
  computedAt: string;
  durationMs: number;
  sourceDurationMs: number | null;
  notice?: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface Me {
  user: { id: string; email: string | null; full_name: string };
  companies: Array<{ company_id: string; company_name: string; role: MemberRole }>;
}

export interface Product {
  id: string;
  company_id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  cost: number;
  stock_quantity: number;
  min_stock: number;
  is_low_stock: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: number;
  product_id: string;
  type: MovementType;
  quantity: number;
  balance_after: number;
  reason: string | null;
  order_id: string | null;
  created_at: string;
  product: { name: string; sku: string } | null;
  order: { number: number } | null;
  author: { full_name: string } | null;
}

export interface CustomerSummary {
  id: string;
  company_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  orders_count: number;
  total_spent: number;
  last_order_at: string | null;
}

export interface CustomerDetail extends CustomerSummary {
  insights: {
    orders_count: number;
    canceled_count: number;
    total_spent: number;
    pending_amount: number;
    average_ticket: number | null;
    first_order_at: string | null;
    last_order_at: string | null;
    days_since_last_order: number | null;
    top_products: Array<{ product_id: string; name: string; quantity: number; revenue: number }>;
  };
  recent_orders: OrderListItem[];
}

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

export interface OrderDetail {
  id: string;
  number: number;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  total: number;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null } | null;
  author: { full_name: string } | null;
  canceler: { full_name: string } | null;
  items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

export interface OrderMutationResult {
  id: string;
  number: number;
  status: OrderStatus;
  total?: number;
  replayed?: boolean;
}

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
  status_breakdown: Partial<Record<OrderStatus, number>>;
  generated_at: string;
  cache: CacheMeta;
}

export interface LatencySummary {
  name: string;
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  lastMs: number;
}

export interface NamespaceMetrics {
  hits: number;
  misses: number;
  bypasses: number;
  staleDiscarded: number;
  invalidations: number;
  failedInvalidations: number;
  hitRate: number | null;
  latency: {
    hit: LatencySummary | null;
    miss: LatencySummary | null;
    bypass: LatencySummary | null;
  };
}

export type CacheEventType = CacheStrategy | 'INVALIDATE' | 'INVALIDATE_FAILED' | 'STALE_DISCARDED';

export interface Diagnostics {
  generated_at: string;
  process: {
    started_at: string;
    uptime_seconds: number;
    node_version: string;
    environment: string;
    timezone: string;
  };
  integrations: {
    supabase: { status: 'up' | 'down'; latencyMs: number | null; detail: string; host: string };
    redis: {
      status: 'up' | 'down';
      latencyMs: number | null;
      detail: string;
      version: string | null;
      key_prefix: string;
      connection: string;
    };
  };
  cache: {
    ttl_seconds: { dashboard: number; catalog: number };
    pending_invalidation: boolean;
    metrics_since: string;
    namespaces: { dashboard: NamespaceMetrics; catalog: NamespaceMetrics };
    keys: Array<{ key: string; ttl: number }>;
    events: Array<{
      at: string;
      type: CacheEventType;
      namespace: 'dashboard' | 'catalog';
      key?: string;
      durationMs?: number;
      message: string;
    }>;
  };
  requests: LatencySummary[];
  errors: Array<{
    at: string;
    source: string;
    code: string;
    message: string;
    route?: string;
    statusCode?: number;
  }>;
}
