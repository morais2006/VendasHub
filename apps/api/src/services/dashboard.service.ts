import type { CacheService } from '../cache/cache-service.js';
import { addDays, daysBetweenInclusive, todayIn } from '../lib/dates.js';
import { badRequest } from '../lib/errors.js';
import type { Scope } from '../plugins/request-context.js';
import { DashboardRepository } from '../repositories/dashboard.repository.js';

export const DEFAULT_PERIOD_DAYS = 30;

export class DashboardService {
  constructor(
    private readonly cache: CacheService,
    private readonly timezone: string,
  ) {}

  /** Período padrão: últimos 30 dias, incluindo hoje, no fuso da loja. */
  resolvePeriod(from?: string, to?: string): { from: string; to: string } {
    const end = to ?? todayIn(this.timezone);
    const start = from ?? addDays(end, -(DEFAULT_PERIOD_DAYS - 1));
    if (start > end) throw badRequest('A data inicial deve ser anterior à final.');
    if (daysBetweenInclusive(start, end) > 366) throw badRequest('O período máximo é de 366 dias.');
    return { from: start, to: end };
  }

  async summary({ auth, company }: Scope, from?: string, to?: string) {
    const period = this.resolvePeriod(from, to);
    const repo = new DashboardRepository(auth.db);
    const { data, cache } = await this.cache.getOrCompute(
      'dashboard',
      company.id,
      { from: period.from, to: period.to, tz: this.timezone },
      () => repo.summary(company.id, period.from, period.to, this.timezone),
    );
    return { ...data, cache };
  }
}
