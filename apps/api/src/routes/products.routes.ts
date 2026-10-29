import type { FastifyPluginAsync } from 'fastify';
import { parseInput } from '../lib/validation.js';
import { authenticate, requireCompany, requireScope } from '../plugins/request-context.js';
import { idParams } from '../schemas/common.js';
import {
  movementListQuery,
  productCreateBody,
  productListQuery,
  productUpdateBody,
  stockAdjustmentBody,
} from '../schemas/products.js';
import type { RouteDeps } from './deps.js';

export function productRoutes(deps: RouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate(deps.auth));
    const member = requireCompany(deps.auth, deps.memberships);
    const manager = requireCompany(deps.auth, deps.memberships, ['owner', 'manager']);

    app.get('/products', { preHandler: member }, async (request) =>
      deps.catalog.list(requireScope(request), parseInput(productListQuery, request.query)),
    );

    app.post('/products', { preHandler: manager }, async (request, reply) => {
      const product = await deps.catalog.create(
        requireScope(request),
        parseInput(productCreateBody, request.body),
      );
      return reply.status(201).send(product);
    });

    app.get('/products/:id', { preHandler: member }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      return deps.catalog.get(requireScope(request), id);
    });

    app.patch('/products/:id', { preHandler: manager }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      return deps.catalog.update(
        requireScope(request),
        id,
        parseInput(productUpdateBody, request.body),
      );
    });

    app.post('/products/:id/archive', { preHandler: manager }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      return deps.catalog.setArchived(requireScope(request), id, true);
    });

    app.post('/products/:id/restore', { preHandler: manager }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      return deps.catalog.setArchived(requireScope(request), id, false);
    });

    app.post('/products/:id/stock-adjustments', { preHandler: manager }, async (request, reply) => {
      const { id } = parseInput(idParams, request.params);
      const result = await deps.catalog.adjustStock(
        requireScope(request),
        id,
        parseInput(stockAdjustmentBody, request.body),
      );
      return reply.status(201).send(result);
    });

    app.get('/products/:id/movements', { preHandler: member }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      const query = parseInput(movementListQuery, request.query);
      return deps.catalog.movements(requireScope(request), { ...query, product_id: id });
    });

    app.get('/stock/movements', { preHandler: member }, async (request) =>
      deps.catalog.movements(requireScope(request), parseInput(movementListQuery, request.query)),
    );
  };
}
