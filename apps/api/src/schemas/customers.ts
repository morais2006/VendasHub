import { z } from 'zod';
import { optionalText, pagination, sortOrder } from './common.js';

export const customerListQuery = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.enum(['active', 'archived', 'all']).default('active'),
  sort: z.enum(['name', 'total_spent', 'last_order', 'created']).default('name'),
  order: sortOrder,
  ...pagination,
});
export type CustomerListQuery = z.infer<typeof customerListQuery>;

const email = z
  .string()
  .trim()
  .max(160)
  .nullish()
  .transform((value) => (value ? value.toLowerCase() : null))
  .refine((value) => value === null || z.email().safeParse(value).success, 'E-mail inválido');

const phone = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .refine(
    (value) => value === null || /^[0-9+() -]{8,20}$/.test(value),
    'Telefone: use apenas números, espaço, +, ( ) e -',
  );

export const customerCreateBody = z.object({
  name: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(120, 'Máximo de 120 caracteres'),
  email,
  phone,
  notes: optionalText(500),
});
export type CustomerCreateInput = z.infer<typeof customerCreateBody>;

export const customerUpdateBody = customerCreateBody
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nada para atualizar');
export type CustomerUpdateInput = z.infer<typeof customerUpdateBody>;
