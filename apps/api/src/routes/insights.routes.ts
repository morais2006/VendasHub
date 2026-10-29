import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseInput } from '../lib/validation.js';
import { authenticate, requireCompany, requireScope } from '../plugins/request-context.js';
import { dateString } from '../schemas/common.js';
import type { RouteDeps } from './deps.js';

const dashboardQuery = z.object({ from: dateString.optional(), to: dateString.optional() });

/** Dashboard comercial e painel técnico (diagnóstico). */
export function insightsRoutes(deps: RouteDeps): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate(deps.auth));
    const member = requireCompany(deps.auth, deps.memberships);
    const manager = requireCompany(deps.auth, deps.memberships, ['owner', 'manager']);

    app.get('/dashboard', { preHandler: member }, async (request) => {
      const { from, to } = parseInput(dashboardQuery, request.query);
      return deps.dashboard.summary(requireScope(request), from, to);
    });

    app.get('/system/diagnostics', { preHandler: member }, async (request) =>
      deps.diagnostics.snapshot(requireScope(request)),
    );

    /** Invalidação manual, para demonstrar o recálculo na apresentação. */
    app.post('/system/cache/invalidate', { preHandler: manager }, async (request) => {
      const { company } = requireScope(request);
      const ok = await deps.cache.invalidate(
        company.id,
        ['dashboard', 'catalog'],
        'invalidação manual no painel de diagnóstico',
      );
      return { ok };
    });
  };
}
