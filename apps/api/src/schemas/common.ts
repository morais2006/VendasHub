import { z } from 'zod';

export const uuidSchema = z.uuid({ error: 'Identificador inválido' });
export const idParams = z.object({ id: uuidSchema });

export const pagination = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
};

export const sortOrder = z.enum(['asc', 'desc']).default('asc');

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Data inválida');

/** Valor monetário em reais: não negativo e com no máximo 2 casas decimais. */
export const money = z
  .number({ error: 'Informe um valor numérico' })
  .min(0, 'O valor não pode ser negativo')
  .max(9_999_999_999.99, 'Valor muito alto')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    error: 'Use no máximo 2 casas decimais',
  });

/** Texto opcional: string vazia vira null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .nullish()
    .transform((value) => (value ? value : null));

export function pageRange(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

export interface Page<T> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return {
    items,
    page,
    page_size: pageSize,
    total,
    total_pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
