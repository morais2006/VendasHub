import type { FastifyPluginAsync } from 'fastify';
import { parseInput } from '../lib/validation.js';
import { authenticate, requireCompany, requireScope } from '../plugins/request-context.js';
import { idParams } from '../schemas/common.js';
import { customerCreateBody, customerListQuery, customerUpdateBody } from '../schemas/customers.js';
import type { RouteDeps } from './deps.js';

export function customerRoutes(deps: RouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate(deps.auth));
    const member = requireCompany(deps.auth, deps.memberships);

    app.get('/customers', { preHandler: member }, async (request) =>
      deps.customers.list(requireScope(request), parseInput(customerListQuery, request.query)),
    );

    app.post('/customers', { preHandler: member }, async (request, reply) => {
      const customer = await deps.customers.create(
        requireScope(request),
        parseInput(customerCreateBody, request.body),
      );
      return reply.status(201).send(customer);
    });

    app.get('/customers/:id', { preHandler: member }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      return deps.customers.get(requireScope(request), id);
    });

    app.patch('/customers/:id', { preHandler: member }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      return deps.customers.update(
        requireScope(request),
        id,
        parseInput(customerUpdateBody, request.body),
      );
    });

    app.post('/customers/:id/archive', { preHandler: member }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      return deps.customers.setArchived(requireScope(request), id, true);
    });

    app.post('/customers/:id/restore', { preHandler: member }, async (request) => {
      const { id } = parseInput(idParams, request.params);
      return deps.customers.setArchived(requireScope(request), id, false);
    });
  };
}
