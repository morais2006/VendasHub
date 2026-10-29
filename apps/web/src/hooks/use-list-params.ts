import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Filtros de listagem guardados na URL: a tela sobrevive a recarregar, o botão
 * voltar funciona e o link pode ser compartilhado. Mudar um filtro volta para a
 * página 1.
 */
export function useListParams<T extends Record<string, string>>(defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams();

  const values = useMemo(() => {
    const result = { ...defaults } as T & { page: number };
    for (const key of Object.keys(defaults)) {
      const value = searchParams.get(key);
      if (value !== null) (result as Record<string, string>)[key] = value;
    }
    result.page = Math.max(1, Number(searchParams.get('page')) || 1);
    return result;
  }, [searchParams, defaults]);

  const update = useCallback(
    (patch: Partial<T> & { page?: number }) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            const isDefault = key !== 'page' && value === defaults[key as keyof T];
            if (
              value === undefined ||
              value === '' ||
              isDefault ||
              (key === 'page' && value === 1)
            ) {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, defaults],
  );

  return [values, update] as const;
}

/** Alterna a ordenação: mesma coluna inverte a direção; coluna nova começa crescente. */
export function nextSort(current: { sort: string; order: string }, column: string) {
  if (current.sort === column)
    return { sort: column, order: current.order === 'asc' ? 'desc' : 'asc' };
  return { sort: column, order: 'asc' };
}
