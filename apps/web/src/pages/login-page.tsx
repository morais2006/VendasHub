import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/providers/auth-provider';

type Mode = 'login' | 'signup';

export function LoginPage() {
  const { session, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
      } else {
        const { needsConfirmation } = await signUp(email.trim(), password, fullName.trim());
        if (needsConfirmation) {
          setInfo('Conta criada. Confirme o e-mail pelo link enviado e depois entre.');
          setMode('login');
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <section className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
            <rect width="32" height="32" rx="8" fill="#fff" fillOpacity="0.14" />
            <path d="M8 10.5h3.2l4.8 11 4.8-11H24l-6.6 14h-2.8z" fill="#fff" />
          </svg>
          <span className="text-lg font-semibold">VendaHub</span>
        </div>
        <div className="max-w-md space-y-5">
          <h1 className="text-4xl leading-tight font-semibold">
            Vendas, estoque e clientes da sua loja em um só lugar.
          </h1>
          <ul className="space-y-2.5 text-[15px] text-primary-foreground/85">
            <li>Pedidos com baixa de estoque automática e segura.</li>
            <li>Faturamento, ticket médio e mais vendidos sempre atualizados.</li>
            <li>Alertas de reposição antes de faltar produto na prateleira.</li>
          </ul>
        </div>
        <p className="text-sm text-primary-foreground/60">
          Gestão comercial para pequenas empresas.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-sm space-y-7">
          <div className="space-y-1.5">
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
                <rect width="32" height="32" rx="8" className="fill-primary" />
                <path d="M8 10.5h3.2l4.8 11 4.8-11H24l-6.6 14h-2.8z" fill="#fff" />
              </svg>
              <span className="font-semibold">VendaHub</span>
            </div>
            <h2 className="text-2xl font-semibold">
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === 'login'
                ? 'Acesse o painel da sua loja.'
                : 'Depois do cadastro você cria a sua empresa.'}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Seu nome</Label>
                <Input
                  id="fullName"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  minLength={2}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'signup' ? 8 : undefined}
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md bg-destructive/8 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {info && (
              <p
                role="status"
                className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground"
              >
                {info}
              </p>
            )}

            <Button type="submit" className="h-10 w-full" disabled={busy || !email || !password}>
              {busy && <Loader2 className="animate-spin" />}
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Criar conta' : 'Entrar'}
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
