import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { CacheMetrics } from './cache/cache-metrics.js';
import { CacheService } from './cache/cache-service.js';
import type { CacheStore } from './cache/cache-store.js';
import { createCacheKeys } from './cache/keys.js';
import type { AppConfig } from './config/env.js';
import { AppError } from './lib/errors.js';
import { ErrorLog } from './observability/error-log.js';
import { LatencyTracker } from './observability/latency.js';
import { MembershipCache, type AuthDeps } from './plugins/request-context.js';
import { accountRoutes } from './routes/account.routes.js';
import { customerRoutes } from './routes/customers.routes.js';
import type { RouteDeps } from './routes/deps.js';
import { insightsRoutes } from './routes/insights.routes.js';
import { orderRoutes } from './routes/orders.routes.js';
import { productRoutes } from './routes/products.routes.js';
import { CatalogService } from './services/catalog.service.js';
import { CustomersService } from './services/customers.service.js';
import { DashboardService } from './services/dashboard.service.js';
import { DiagnosticsService } from './services/diagnostics.service.js';
import { OrdersService } from './services/orders.service.js';

export interface AppDeps {
  config: AppConfig;
  auth: AuthDeps;
  cacheStore: CacheStore;
  logger?: FastifyServerOptions['logger'];
  /** Pasta do build do front-end servida em produção (opcional). */
  webDistDir?: string;
}

export const DEFAULT_WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: deps.logger ?? false,
    bodyLimit: 256 * 1024,
  });

  app.decorateRequest('auth', null);
  app.decorateRequest('company', null);

  const requestLatency = new LatencyTracker(200);
  const errorLog = new ErrorLog(30);
  const cache = new CacheService(
    deps.cacheStore,
    createCacheKeys(config.redisKeyPrefix),
    new CacheMetrics(),
    app.log,
    config.cacheTtl,
  );

  const routeDeps: RouteDeps = {
    auth: deps.auth,
    memberships: new MembershipCache(),
    cache,
    catalog: new CatalogService(cache),
    customers: new CustomersService(config.timezone),
    orders: new OrdersService(cache, config.timezone),
    dashboard: new DashboardService(cache, config.timezone),
    diagnostics: new DiagnosticsService(config, cache, deps.cacheStore, requestLatency, errorLog),
    redisReady: () => deps.cacheStore.isReady(),
  };

  await app.register(helmet, {
    // A CSP do front-end é definida no index.html servido; a API só devolve JSON.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: config.webOrigins,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Company-Id', 'Idempotency-Key'],
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: {
        code: 'RATE_LIMITED',
        message: `Muitas requisições. Tente novamente em ${Math.ceil(context.ttl / 1000)} s.`,
      },
    }),
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url;
    if (route?.startsWith('/api/')) {
      requestLatency.record(`${request.method} ${route}`, reply.elapsedTime);
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const route = request.routeOptions.url ?? request.url;
    const companyId = request.company?.id;

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error, code: error.code }, error.message);
        errorLog.push({
          source: error.code === 'DATABASE_ERROR' ? 'supabase' : 'request',
          code: error.code,
          message: error.message,
          route,
          statusCode: error.statusCode,
          ...(companyId ? { companyId } : {}),
        });
      }
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }

    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) return reply.status(429).send(error);
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({
        error: { code: 'BAD_REQUEST', message: 'Requisição inválida.' },
      });
    }

    request.log.error({ err: error }, 'erro não tratado');
    errorLog.push({
      source: 'request',
      code: 'INTERNAL_ERROR',
      message: 'Erro interno inesperado (detalhes no log do servidor)',
      route,
      statusCode: 500,
      ...(companyId ? { companyId } : {}),
    });
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno. Tente novamente em instantes.' },
    });
  });

  /** Verificação pública de saúde (sem detalhes internos). */
  app.get('/api/health', async () => ({
    status: 'ok',
    redis: deps.cacheStore.isReady() ? 'up' : 'down',
    time: new Date().toISOString(),
  }));

  for (const routes of [
    accountRoutes,
    productRoutes,
    customerRoutes,
    orderRoutes,
    insightsRoutes,
  ]) {
    await app.register(routes(routeDeps), { prefix: '/api' });
  }

  // Em produção, a própria API serve o front-end compilado (um único processo).
  const webDist = deps.webDistDir;
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.method !== 'GET') {
        return reply
          .status(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_request, reply) =>
      reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }),
    );
  }

  return app;
}
