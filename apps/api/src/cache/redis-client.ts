import { Redis } from 'ioredis';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Cliente ioredis configurado para falhar rápido: sem fila offline e com tempo
 * limite curto por comando. Se o Redis cair, as requisições seguem para o
 * PostgreSQL em vez de ficarem presas esperando o cache. A conexão só abre
 * em connect(), depois que o logger da aplicação estiver pronto.
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    connectTimeout: 2_000,
    commandTimeout: 1_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    // Reconexão contínua com espera crescente (máx. 5 s).
    retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
  });
}

export function attachRedisLogging(client: Redis, logger: FastifyBaseLogger): void {
  let lastErrorLog = 0;
  client.on('ready', () => logger.info({ redis: 'ready' }, 'Redis conectado'));
  client.on('error', (error: Error) => {
    // Evita inundar o log durante as tentativas de reconexão.
    const now = Date.now();
    if (now - lastErrorLog > 10_000) {
      lastErrorLog = now;
      logger.warn({ redis: client.status, err: error.message }, 'Redis indisponível');
    }
  });
}
