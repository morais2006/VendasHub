import { throwIfDbError } from '../lib/errors.js';
import type { Db } from '../lib/supabase.js';
import { ilikeAny } from '../lib/validation.js';
import { pageRange, toPage, type Page } from '../schemas/common.js';
import type {
  MovementListQuery,
  ProductCreateInput,
  ProductListQuery,
  ProductUpdateInput,
  StockAdjustmentInput,
} from '../schemas/products.js';
import type { Tables } from '../types/database.types.js';

export type Product = Tables<'products'>;

export interface StockMovement {
  id: number;
  product_id: string;
  type: Tables<'stock_movements'>['type'];
  quantity: number;
  balance_after: number;
  reason: string | null;
  order_id: string | null;
  created_at: string;
  product: { name: string; sku: string } | null;
  order: { number: number } | null;
  author: { full_name: string } | null;
}

const PRODUCT_COLUMNS =
  'id, company_id, sku, name, description, price, cost, stock_quantity, min_stock, is_low_stock, archived_at, created_at, updated_at';

const SORT_COLUMNS = {
  name: 'name',
  sku: 'sku',
  price: 'price',
  stock: 'stock_quantity',
  updated: 'updated_at',
} as const;

export class ProductsRepository {
  constructor(private readonly db: Db) {}

  async list(companyId: string, query: ProductListQuery): Promise<Page<Product>> {
    const [from, to] = pageRange(query.page, query.page_size);
    let request = this.db
      .from('products')
      .select(PRODUCT_COLUMNS, { count: 'exact' })
      .eq('company_id', companyId);

    if (query.status === 'active') request = request.is('archived_at', null);
    if (query.status === 'archived') request = request.not('archived_at', 'is', null);
    if (query.status === 'low') request = request.is('archived_at', null).eq('is_low_stock', true);
    if (query.search) request = request.or(ilikeAny(['name', 'sku'], query.search));

    const { data, count, error } = await request
      .order(SORT_COLUMNS[query.sort], { ascending: query.order === 'asc' })
      .order('id')
      .range(from, to);
    throwIfDbError(error);
    return toPage(data ?? [], count ?? 0, query.page, query.page_size);
  }

  async get(companyId: string, id: string): Promise<Product> {
    const { data, error } = await this.db
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('company_id', companyId)
      .eq('id', id)
      .single();
    throwIfDbError(error);
    return data!;
  }

  async create(companyId: string, input: ProductCreateInput): Promise<Product> {
    const { data, error } = await this.db
      .from('products')
      .insert({ company_id: companyId, ...input })
      .select(PRODUCT_COLUMNS)
      .single();
    throwIfDbError(error);
    return data!;
  }

  async update(companyId: string, id: string, input: ProductUpdateInput): Promise<Product> {
    const { data, error } = await this.db
      .from('products')
      .update(input)
      .eq('company_id', companyId)
      .eq('id', id)
      .select(PRODUCT_COLUMNS)
      .single();
    throwIfDbError(error);
    return data!;
  }

  async setArchived(companyId: string, id: string, archived: boolean): Promise<Product> {
    const { data, error } = await this.db
      .from('products')
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq('company_id', companyId)
      .eq('id', id)
      .select(PRODUCT_COLUMNS)
      .single();
    throwIfDbError(error);
    return data!;
  }

  async adjustStock(productId: string, input: StockAdjustmentInput) {
    const { data, error } = await this.db.rpc('adjust_stock', {
      p_product_id: productId,
      p_quantity: input.quantity,
      p_type: input.type,
      ...(input.reason ? { p_reason: input.reason } : {}),
    });
    throwIfDbError(error);
    return data as {
      product_id: string;
      company_id: string;
      stock_quantity: number;
      movement_id: number;
    };
  }

  async movements(companyId: string, query: MovementListQuery): Promise<Page<StockMovement>> {
    const [from, to] = pageRange(query.page, query.page_size);
    let request = this.db
      .from('stock_movements')
      .select(
        'id, product_id, type, quantity, balance_after, reason, order_id, created_at, ' +
          'product:products!stock_movements_product_id_company_id_fkey(name, sku), ' +
          'order:orders!stock_movements_order_id_company_id_fkey(number), ' +
          'author:profiles!stock_movements_created_by_fkey(full_name)',
        { count: 'exact' },
      )
      .eq('company_id', companyId);
    if (query.product_id) request = request.eq('product_id', query.product_id);
    if (query.type) request = request.eq('type', query.type);

    const { data, count, error } = await request
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);
    throwIfDbError(error);
    return toPage(
      (data ?? []) as unknown as StockMovement[],
      count ?? 0,
      query.page,
      query.page_size,
    );
  }
}
