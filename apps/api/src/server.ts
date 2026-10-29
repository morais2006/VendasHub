import { buildApp, DEFAULT_WEB_DIST } from './app.js';
import { RedisCacheStore } from './cache/cache-store.js';
import { attachRedisLogging, createRedisClient } from './cache/redis-client.js';
import { loadConfig, loadRootEnvFile, type AppConfig } from './config/env.js';
import { createAuthClient, createUserClient } from './lib/supabase.js';
import { AccountRepository } from './repositories/account.repository.js';

loadRootEnvFile();
// Código-fonte via tsx (npm run dev) = desenvolvimento; build compilado
// (npm start) = produção. Um NODE_ENV definido explicitamente sempre prevalece.
process.env.NODE_ENV ??= import.meta.url.endsWith('.ts') ? 'development' : 'production';

let config: AppConfig;
try {
  config = loadConfig();
} catch (error) {
  console.error(`\n${(error as Error).message}\n`);
  process.exit(1);
}

const isDev = config.nodeEnv === 'development';
const authClient = createAuthClient(config.supabaseUrl, config.supabasePublishableKey);
const redis = createRedisClient(config.redisUrl);

const app = await buildApp({
  config,
  logger: {
    level: config.logLevel,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    ...(isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname', singleLine: true },
          },
        }
      : {}),
  },
  cacheStore: new RedisCacheStore(redis),
  webDistDir: config.nodeEnv === 'production' ? DEFAULT_WEB_DIST : undefined,
  auth: {
    async verifyToken(token) {
      // Verifica assinatura (JWKS do projeto) e expiração do JWT do Supabase Auth.
      const { data, error } = await authClient.auth.getClaims(token);
      if (error || !data?.claims?.sub || data.claims.role !== 'authenticated') return null;
      return { userId: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
    },
    createDb: (token) => createUserClient(config.supabaseUrl, config.supabasePublishableKey, token),
    lookupRole: (db, userId, companyId) => new AccountRepository(db).role(userId, companyId),
  },
});

attachRedisLogging(redis, app.log);
// Falha de conexão não derruba a API: as leituras seguem em BYPASS até o Redis voltar.
redis.connect().catch(() => undefined);

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'encerrando');
  await app.close();
  redis.disconnect();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
