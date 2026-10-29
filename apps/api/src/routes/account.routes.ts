import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../lib/validation.js';
import { authenticate, requireAuth } from '../plugins/request-context.js';
import { AccountRepository } from '../repositories/account.repository.js';
import type { RouteDeps } from './deps.js';

const companyBody = z.object({
  name: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(120, 'Máximo de 120 caracteres'),
});
const profileBody = z.object({
  full_name: z.string().trim().min(2, 'Mínimo de 2 caracteres').max(120),
});

export function accountRoutes(deps: RouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate(deps.auth));

    /** Usuário logado e as empresas às quais pertence. */
    app.get('/me', async (request) => {
      const auth = requireAuth(request);
      const repo = new AccountRepository(auth.db);
      const [profile, companies] = await Promise.all([
        repo.profile(auth.userId),
        repo.memberships(auth.userId),
      ]);
      return {
        user: { id: auth.userId, email: auth.email, full_name: profile?.full_name ?? '' },
        companies,
      };
    });

    app.patch('/me', async (request) => {
      const auth = requireAuth(request);
      const body = parseInput(profileBody, request.body);
      await new AccountRepository(auth.db).updateProfileName(auth.userId, body.full_name);
      return { ok: true };
    });

    /** Cria uma empresa com o usuário como proprietário (primeiro acesso). */
    app.post('/companies', async (request, reply) => {
      const auth = requireAuth(request);
      const body = parseInput(companyBody, request.body);
      const id = await new AccountRepository(auth.db).createCompany(body.name);
      deps.memberships.forget(auth.userId);
      return reply.status(201).send({ id, name: body.name, role: 'owner' });
    });
  };
}
