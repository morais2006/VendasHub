const KEY = 'vendahub:company';

/** Empresa escolhida na última visita (conveniência; sem garantia de persistência). */
export function readStoredCompany(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function storeCompany(companyId: string | null): void {
  try {
    if (companyId) window.localStorage.setItem(KEY, companyId);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Armazenamento bloqueado (aba anônima, política do navegador): segue sem lembrar.
  }
}

let current: string | null = null;
export const activeCompany = {
  get: () => current,
  set: (id: string | null) => {
    current = id;
  },
};
