import type { z } from 'zod';
import { badRequest } from './errors.js';

/** Valida a entrada com zod e devolve 400 com os campos problemáticos. */
export function parseInput<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || '(corpo)',
      message: issue.message,
    }));
    throw badRequest('Dados inválidos. Revise os campos destacados.', { fields });
  }
  return result.data;
}

/**
 * Escapa um termo de busca para uso em filtros ilike do PostgREST: remove os
 * curingas do usuário e protege as aspas usadas pela sintaxe do filtro.
 */
export function ilikePattern(term: string): string {
  const literal = term.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `"%${literal.replace(/"/g, '\\"')}%"`;
}

export function ilikeAny(columns: readonly string[], term: string): string {
  const pattern = ilikePattern(term);
  return columns.map((column) => `${column}.ilike.${pattern}`).join(',');
}
