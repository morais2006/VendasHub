import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

/** Lê o .env da raiz e devolve SOMENTE o que pode ir para o navegador. */
function publicEnv(mode: string) {
  const env = { ...loadEnv(mode, ROOT_DIR, ''), ...process.env };
  const supabaseUrl = (env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '';
  const role = (() => {
    try {
      return JSON.parse(Buffer.from(publishableKey.split('.')[1] ?? '', 'base64url').toString())
        .role;
    } catch {
      return undefined;
    }
  })();
  if (publishableKey.startsWith('sb_secret_') || role === 'service_role') {
    throw new Error(
      'SUPABASE_PUBLISHABLE_KEY contém uma chave SECRETA: ela não pode ir para o navegador.',
    );
  }
  return { supabaseUrl, publishableKey, apiPort: env.PORT || '3333' };
}

/**
 * CSP do build de produção (no modo dev o Vite precisa de scripts inline).
 * frame-ancestors não vale em <meta>: o bloqueio de iframe vem do
 * X-Frame-Options que a API envia (helmet).
 */
function contentSecurityPolicy(supabaseUrl: string): Plugin {
  const supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : '*.supabase.co';
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'vendahub-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      ),
  };
}

export default defineConfig(({ mode }) => {
  const env = publicEnv(mode);
  const apiTarget = `http://localhost:${env.apiPort}`;
  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicy(env.supabaseUrl)],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    // Nenhuma variável do .env é exposta automaticamente: só as duas abaixo.
    envDir: false,
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.supabaseUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.publishableKey),
    },
    build: { chunkSizeWarningLimit: 700 },
    // Em desenvolvimento, /api é encaminhado para a API (sem CORS no navegador).
    server: { port: 5173, proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
    preview: { port: 4173, proxy: { '/api': { target: apiTarget, changeOrigin: true } } },
  };
});
