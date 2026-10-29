import type { CacheService } from '../cache/cache-service.js';
import type { Scope } from '../plugins/request-context.js';
import { OrdersRepository } from '../repositories/orders.repository.js';
import type { OrderCreateInput, OrderListQuery } from '../schemas/orders.js';

export class OrdersService {
  constructor(
    private readonly cache: CacheService,
    private readonly timezone: string,
  ) {}

  list({ auth, company }: Scope, query: OrderListQuery) {
    return new OrdersRepository(auth.db).list(company.id, query, this.timezone);
  }

  get({ auth, company }: Scope, id: string) {
    return new OrdersRepository(auth.db).get(company.id, id);
  }

  /**
   * Cria o pedido numa única transação no banco. A invalidação do cache só
   * acontece depois do commit e não acontece numa repetição idempotente
   * (nada mudou no banco).
   */
  async create({ auth, company }: Scope, input: OrderCreateInput, idempotencyKey: string) {
    const result = await new OrdersRepository(auth.db).create(company.id, input, idempotencyKey);
    if (!result.replayed) {
      await this.cache.invalidate(
        company.id,
        ['dashboard', 'catalog'],
        `pedido #${result.number} criado`,
      );
    }
    return result;
  }

  async setStatus({ auth, company }: Scope, id: string, status: 'paid' | 'completed') {
    const repo = new OrdersRepository(auth.db);
    await repo.get(company.id, id); // 404 se o pedido não for desta empresa
    const result = await repo.setStatus(id, status);
    await this.cache.invalidate(
      company.id,
      ['dashboard'],
      `pedido #${result.number} marcado como ${status === 'paid' ? 'pago' : 'concluído'}`,
    );
    return result;
  }

  async cancel({ auth, company }: Scope, id: string, reason: string) {
    const repo = new OrdersRepository(auth.db);
    await repo.get(company.id, id);
    const result = await repo.cancel(id, reason);
    await this.cache.invalidate(
      company.id,
      ['dashboard', 'catalog'],
      `pedido #${result.number} cancelado`,
    );
    return result;
  }
}
