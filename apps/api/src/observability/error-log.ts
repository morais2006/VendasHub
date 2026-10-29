export interface LoggedError {
  at: string;
  source: 'request' | 'redis' | 'supabase';
  code: string;
  /** Mensagem já sanitizada: nunca contém tokens, chaves ou stack trace. */
  message: string;
  route?: string;
  statusCode?: number;
  /** Empresa da requisição, quando houver (filtra o que cada usuário vê). */
  companyId?: string;
}

/** Últimos erros relevantes do processo, para a tela de diagnóstico. */
export class ErrorLog {
  private readonly entries: LoggedError[] = [];

  constructor(private readonly limit = 30) {}

  push(entry: Omit<LoggedError, 'at'>): void {
    this.entries.push({ at: new Date().toISOString(), ...entry });
    if (this.entries.length > this.limit) this.entries.shift();
  }

  /** Erros da empresa informada e erros de infraestrutura (sem empresa). */
  visibleTo(companyId: string): LoggedError[] {
    return this.entries
      .filter((entry) => !entry.companyId || entry.companyId === companyId)
      .reverse();
  }
}
