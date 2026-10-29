import type { CacheService } from '../cache/cache-service.js';
import type { CacheNamespace } from '../cache/keys.js';
import type { Scope } from '../plugins/request-context.js';
import { ProductsRepository } from '../repositories/products.repository.js';
import type {
  MovementListQuery,
  ProductCreateInput,
  ProductListQuery,
  ProductUpdateInput,
  StockAdjustmentInput,
} from '../schemas/products.js';

/** Alterações de produto mexem no catálogo e no alerta de estoque baixo do dashboard. */
const AFFECTED: readonly CacheNamespace[] = ['catalog', 'dashboard'];

export class CatalogService {
  constructor(private readonly cache: CacheService) {}

  async list({ auth, company }: Scope, query: ProductListQuery) {
    const repo = new ProductsRepository(auth.db);
    const { data, cache } = await this.cache.getOrCompute('catalog', company.id, query, () =>
      repo.list(company.id, query),
    );
    return { ...data, cache };
  }

  get({ auth, company }: Scope, id: string) {
    return new ProductsRepository(auth.db).get(company.id, id);
  }

  async create({ auth, company }: Scope, input: ProductCreateInput) {
    const product = await new ProductsRepository(auth.db).create(company.id, input);
    await this.cache.invalidate(company.id, AFFECTED, `produto ${product.sku} cadastrado`);
    return product;
  }

  async update({ auth, company }: Scope, id: string, input: ProductUpdateInput) {
    const product = await new ProductsRepository(auth.db).update(company.id, id, input);
    await this.cache.invalidate(company.id, AFFECTED, `produto ${product.sku} atualizado`);
    return product;
  }

  async setArchived({ auth, company }: Scope, id: string, archived: boolean) {
    const product = await new ProductsRepository(auth.db).setArchived(company.id, id, archived);
    await this.cache.invalidate(
      company.id,
      AFFECTED,
      `produto ${product.sku} ${archived ? 'arquivado' : 'restaurado'}`,
    );
    return product;
  }

  async adjustStock({ auth, company }: Scope, id: string, input: StockAdjustmentInput) {
    const repo = new ProductsRepository(auth.db);
    // Garante que o produto é desta empresa antes de chamar a função.
    const product = await repo.get(company.id, id);
    const result = await repo.adjustStock(product.id, input);
    await this.cache.invalidate(
      company.id,
      AFFECTED,
      `${input.type === 'purchase' ? 'entrada' : 'ajuste'} de estoque em ${product.sku}`,
    );
    return result;
  }

  movements({ auth, company }: Scope, query: MovementListQuery) {
    return new ProductsRepository(auth.db).movements(company.id, query);
  }
}
