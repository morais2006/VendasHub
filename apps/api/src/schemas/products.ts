import { z } from 'zod';
import { money, optionalText, pagination, sortOrder } from './common.js';

export const productListQuery = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'low', 'archived', 'all']).default('active'),
  sort: z.enum(['name', 'sku', 'price', 'stock', 'updated']).default('name'),
  order: sortOrder,
  ...pagination,
});
export type ProductListQuery = z.infer<typeof productListQuery>;

const sku = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/, 'SKU: letras, números, ponto, hífen ou _ (até 40)');
const name = z
  .string()
  .trim()
  .min(2, 'Mínimo de 2 caracteres')
  .max(120, 'Máximo de 120 caracteres');
const quantity = z
  .number()
  .int('Use um número inteiro')
  .min(0, 'Não pode ser negativo')
  .max(1_000_000);

export const productCreateBody = z.object({
  sku,
  name,
  description: optionalText(1000),
  price: money,
  cost: money.default(0),
  stock_quantity: quantity.default(0),
  min_stock: quantity.default(0),
});
export type ProductCreateInput = z.infer<typeof productCreateBody>;

// O saldo de estoque não é editável aqui: só por movimentação (adjust_stock).
export const productUpdateBody = z
  .object({
    sku,
    name,
    description: optionalText(1000),
    price: money,
    cost: money,
    min_stock: quantity,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nada para atualizar');
export type ProductUpdateInput = z.infer<typeof productUpdateBody>;

export const stockAdjustmentBody = z
  .object({
    type: z.enum(['purchase', 'adjustment']),
    quantity: z
      .number()
      .int('Use um número inteiro')
      .min(-100_000)
      .max(100_000)
      .refine((value) => value !== 0, 'A quantidade não pode ser zero'),
    reason: optionalText(300),
  })
  .refine((value) => value.type !== 'purchase' || value.quantity > 0, {
    error: 'Entrada por compra deve ser positiva',
    path: ['quantity'],
  })
  .refine((value) => value.type !== 'adjustment' || Boolean(value.reason), {
    error: 'Informe o motivo do ajuste',
    path: ['reason'],
  });
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentBody>;

export const movementListQuery = z.object({
  product_id: z.uuid().optional(),
  type: z.enum(['initial', 'purchase', 'adjustment', 'sale', 'cancellation']).optional(),
  ...pagination,
});
export type MovementListQuery = z.infer<typeof movementListQuery>;
