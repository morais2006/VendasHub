import { z } from 'zod';
import { dateString, money, optionalText, pagination } from './common.js';

export const orderStatus = z.enum(['pending', 'paid', 'completed', 'canceled']);

export const orderListQuery = z
  .object({
    status: orderStatus.optional(),
    customer_id: z.uuid().optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    number: z.coerce.number().int().positive().optional(),
    ...pagination,
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    error: 'A data inicial deve ser anterior à final',
    path: ['from'],
  });
export type OrderListQuery = z.infer<typeof orderListQuery>;

// Preço e total NÃO são aceitos do cliente: o banco calcula a partir do cadastro.
export const orderCreateBody = z.object({
  customer_id: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  items: z
    .array(
      z.object({
        product_id: z.uuid({ error: 'Produto inválido' }),
        quantity: z.number().int('Use um número inteiro').min(1, 'Mínimo de 1').max(100_000),
      }),
    )
    .min(1, 'Adicione pelo menos um produto')
    .max(100, 'Máximo de 100 itens'),
  discount: money.default(0),
  status: z.enum(['pending', 'paid']).default('pending'),
  notes: optionalText(500),
});
export type OrderCreateInput = z.infer<typeof orderCreateBody>;

export const idempotencyHeader = z.uuid({
  error: 'Envie o cabeçalho Idempotency-Key com um UUID gerado para esta venda',
});

export const orderStatusBody = z.object({ status: z.enum(['paid', 'completed']) });

export const orderCancelBody = z.object({
  reason: z.string().trim().min(3, 'Informe o motivo (mín. 3 caracteres)').max(300),
});
