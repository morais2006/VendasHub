import type { CacheService } from '../cache/cache-service.js';
import type { AuthDeps, MembershipCache } from '../plugins/request-context.js';
import type { CatalogService } from '../services/catalog.service.js';
import type { CustomersService } from '../services/customers.service.js';
import type { DashboardService } from '../services/dashboard.service.js';
import type { DiagnosticsService } from '../services/diagnostics.service.js';
import type { OrdersService } from '../services/orders.service.js';

export interface RouteDeps {
  auth: AuthDeps;
  memberships: MembershipCache;
  cache: CacheService;
  catalog: CatalogService;
  customers: CustomersService;
  orders: OrdersService;
  dashboard: DashboardService;
  diagnostics: DiagnosticsService;
  redisReady(): boolean;
}
