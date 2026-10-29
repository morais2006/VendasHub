/**
 * Verifica se a máquina está pronta para rodar o VendaHub:
 * .env, Supabase (URL, chaves, migrações), Redis e build do front-end.
 *
 * Uso: npm run check:env   (na raiz do projeto)
 */
import { existsSync } from 'node:fs';
import { Redis } from 'ioredis';
import { DEFAULT_WEB_DIST } from '../src/app.js';
import { loadConfig, loadRootEnvFile, ROOT_ENV_PATH, type AppConfig } from '../src/config/env.js';
import { createAdminClient } from '../src/lib/supabase.js';

const ok = (message: string) => console.log(`  ✔ ${message}`);
const warn = (message: string) => console.log(`  ! ${message}`);
const fail = (message: string) => {
  console.log(`  ✖ ${message}`);
  process.exitCode = 1;
};

console.log('\nVendaHub — verificação do ambiente\n');

const [major, minor] = process.versions.node.split('.').map(Number) as [number, number];
if (major > 22 || (major === 22 && minor >= 12)) ok(`Node.js ${process.version}`);
else fail(`Node.js ${process.version}: use a versão 22.12 ou superior`);

if (loadRootEnvFile()) ok(`.env encontrado (${ROOT_ENV_PATH})`);
else warn('.env não encontrado na raiz: usando apenas variáveis do ambiente');

let config: AppConfig;
try {
  config = loadConfig();
  ok('Variáveis obrigatórias presentes e válidas');
} catch (error) {
  fail((error as Error).message);
  process.exit(1);
}

// --- Supabase -----------------------------------------------------------------
try {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/health`, {
    headers: { apikey: config.supabasePublishableKey },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.ok) ok(`Supabase Auth respondeu (${new URL(config.supabaseUrl).host})`);
  else
    fail(`Supabase Auth respondeu HTTP ${response.status}: confira SUPABASE_URL e a chave pública`);
} catch (error) {
  fail(`Supabase inacessível: ${(error as Error).message}`);
}

if (!config.supabaseSecretKey) {
  warn('SUPABASE_SECRET_KEY ausente: a API funciona, mas o seed e os testes de integração não');
} else {
  const admin = createAdminClient(config.supabaseUrl, config.supabaseSecretKey);
  const { error, count } = await admin
    .from('companies')
    .select('id', { count: 'exact', head: true });
  if (!error) {
    ok(`Migrações aplicadas (tabela companies acessível, ${count ?? 0} empresa(s))`);
    if (!count) warn('Banco sem dados: rode "npm run db:seed" para criar a demonstração');
  } else if (/does not exist|schema cache/i.test(error.message)) {
    fail('Tabelas não encontradas: aplique as migrações (veja o README, seção "Banco de dados")');
  } else {
    fail(`Falha ao consultar o banco com a chave secreta: ${error.message}`);
  }
}

// --- Redis --------------------------------------------------------------------
const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  connectTimeout: 2_000,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});
try {
  await redis.connect();
  const started = performance.now();
  await redis.ping();
  const version = /redis_version:([^\r\n]+)/.exec(await redis.info('server'))?.[1] ?? '?';
  ok(
    `Redis ${version} em ${config.redisUrl} (PING ${(performance.now() - started).toFixed(1)} ms)`,
  );
} catch {
  warn(
    `Redis indisponível em ${config.redisUrl}: a API funciona em modo BYPASS (sem cache). ` +
      'Suba com "npm run redis:up" (Docker) ou inicie o Memurai/Redis local.',
  );
} finally {
  redis.disconnect();
}

// --- Front-end ----------------------------------------------------------------
if (existsSync(DEFAULT_WEB_DIST)) ok('Build do front-end encontrado (apps/web/dist)');
else warn('Front-end ainda não compilado: "npm run build" (necessário só para "npm start")');

console.log(process.exitCode ? '\nCorrija os itens marcados com ✖.\n' : '\nTudo pronto.\n');
