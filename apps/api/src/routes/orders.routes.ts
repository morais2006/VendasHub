import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../lib/errors.js';
import { parseInput } from '../lib/validation.js';
import { authenticate, requireCompany, requireScope } from '../plugins/request-context.js';
import { idParams } from '../schemas/common.js';
import {
  idempotencyHeader,
  orderCancelBody,
  orderCreateBody,
  orderListQuery,
  orderStatusBody,
} from '../schemas/orders.js';
import type { RouteDeps } from './deps.js';

export function orderRoutes(deps: RouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate(deps.auth));
    const member = requireCompany(deps.auth, deps.memberships);
    const manager = requireCompany(deps.auth, deps.memberships, ['owner', 'manager']);

    app.get('/orders', { preHandler: member }, async (request) =>
      deps.orders.list(requireScope(request), parseInput(orderListQuery, request.query)),
    );

    /**
     * Cria um pedido. O cliente envia só produtos e quantidades; preços,
     * subtotal e total são calculados no banco. O cabeçalho Idempotency-Key
     * torna a operação segura para repetir (duplo clique, nova tentativa).
     */
    app.post('/orders', { preHandler: member }, async (request, reply) => {
      const key = idempotencyHeader.safeParse(request.headers['idempotency-key']);
      if (!key.success) {
        throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', key.error.issues[0]!.message);
      }
      const body = parseInput(orderCreateBody, request.body);
      const result = await deps.orders.create(requireScope(request), body, key.data);
      return reply.status(result.replayed ? 200 : 201).send(result);
    });

    app.get('/orders/:id', { preHandler: member }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      return deps.orders.get(requireScope(request), id);
    });

    app.post('/orders/:id/status', { preHandler: member }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      const { status } = parseInput(orderStatusBody, request.body);
      return deps.orders.setStatus(requireScope(request), id, status);
    });

    app.post('/orders/:id/cancel', { preHandler: manager }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      const { reason } = parseInput(orderCancelBody, request.body);
      return deps.orders.cancel(requireScope(request), id, reason);
    });
  };
}
