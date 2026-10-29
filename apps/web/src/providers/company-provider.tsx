import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { activeCompany, readStoredCompany, storeCompany } from '@/lib/company-storage';
import type { Me, MemberRole } from '@/lib/types';
import { useAuth } from './auth-provider';

export interface ActiveCompany {
  id: string;
  name: string;
  role: MemberRole;
}

interface CompanyContextValue {
  me: Me | undefined;
  loading: boolean;
  error: unknown;
  company: ActiveCompany | null;
  selectCompany(id: string): void;
  refresh(): Promise<unknown>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Proprietário',
  manager: 'Gerente',
  seller: 'Vendedor',
};

/** Ações que exigem dono ou gerente (o backend e o RLS aplicam a mesma regra). */
export const canManage = (role: MemberRole | undefined) => role === 'owner' || role === 'manager';

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(() => readStoredCompany());

  const meQuery = useQuery({
    queryKey: ['me', session?.user.id],
    queryFn: () => api<Me>('/me', { withCompany: false }),
    enabled: Boolean(session),
    staleTime: 5 * 60_000,
  });

  const company = useMemo<ActiveCompany | null>(() => {
    const companies = meQuery.data?.companies ?? [];
    const match = companies.find((c) => c.company_id === selected) ?? companies[0];
    return match ? { id: match.company_id, name: match.company_name, role: match.role } : null;
  }, [meQuery.data, selected]);

  // A empresa ativa vai em todas as requisições (X-Company-Id). É atualizada
  // durante o render para que as consultas da nova empresa já saiam com ela.
  activeCompany.set(company?.id ?? null);

  const selectCompany = useCallback(
    (id: string) => {
      storeCompany(id);
      setSelected(id);
      activeCompany.set(id);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
    },
    [queryClient],
  );

  const value = useMemo<CompanyContextValue>(
    () => ({
      me: meQuery.data,
      loading: meQuery.isPending && Boolean(session),
      error: meQuery.error,
      company,
      selectCompany,
      refresh: () => meQuery.refetch(),
    }),
    [meQuery, session, company, selectCompany],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const context = useContext(CompanyContext);
  if (!context) throw new Error('useCompany fora do CompanyProvider');
  return context;
}

/** Empresa ativa garantida (usar só dentro das rotas protegidas). */
export function useActiveCompany(): ActiveCompany {
  const { company } = useCompany();
  if (!company) throw new Error('Nenhuma empresa ativa');
  return company;
}
