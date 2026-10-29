import type { Scope } from '../plugins/request-context.js';
import { CustomersRepository } from '../repositories/customers.repository.js';
import { OrdersRepository } from '../repositories/orders.repository.js';
import type {
  CustomerCreateInput,
  CustomerListQuery,
  CustomerUpdateInput,
} from '../schemas/customers.js';

/**
 * Clientes não invalidam o cache: os indicadores cacheados vêm dos pedidos e
 * produtos, e o nome exibido nos pedidos é lido na hora (não fica em cache).
 */
export class CustomersService {
  constructor(private readonly timezone: string) {}

  list({ auth, company }: Scope, query: CustomerListQuery) {
    return new CustomersRepository(auth.db).list(company.id, query);
  }

  async get({ auth, company }: Scope, id: string) {
    const repo = new CustomersRepository(auth.db);
    const customer = await repo.get(company.id, id);
    const [insights, recentOrders] = await Promise.all([
      repo.insights(id),
      new OrdersRepository(auth.db).list(
        company.id,
        { customer_id: id, page: 1, page_size: 10 },
        this.timezone,
      ),
    ]);
    return { ...customer, insights, recent_orders: recentOrders.items };
  }

  async create({ auth, company }: Scope, input: CustomerCreateInput) {
    const repo = new CustomersRepository(auth.db);
    const id = await repo.create(company.id, input);
    return repo.get(company.id, id);
  }

  async update({ auth, company }: Scope, id: string, input: CustomerUpdateInput) {
    const repo = new CustomersRepository(auth.db);
    await repo.update(company.id, id, input);
    return repo.get(company.id, id);
  }

  async setArchived({ auth, company }: Scope, id: string, archived: boolean) {
    const repo = new CustomersRepository(auth.db);
    await repo.setArchived(company.id, id, archived);
    return repo.get(company.id, id);
  }
}
