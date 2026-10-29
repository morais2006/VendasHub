import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { useCompany } from '@/providers/company-provider';

/** Primeiro acesso (ou nova empresa): cria a empresa com o usuário como proprietário. */
export function OnboardingPage() {
  const { me, refresh, selectCompany } = useCompany();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCompanies = (me?.companies.length ?? 0) > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>('/companies', {
        method: 'POST',
        body: { name: name.trim() },
        withCompany: false,
      });
      await refresh();
      selectCompany(created.id);
      toast.success('Empresa criada');
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold">
            {hasCompanies
              ? 'Nova empresa'
              : `Bem-vindo${me?.user.full_name ? `, ${me.user.full_name.split(' ')[0]}` : ''}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {hasCompanies
              ? 'Os dados de cada empresa ficam totalmente separados.'
              : 'Para começar, informe o nome da sua loja. Você será o proprietário.'}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="company">Nome da empresa</Label>
            <Input
              id="company"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Mercearia Boa Vista"
              required
              minLength={2}
              maxLength={120}
              autoFocus
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => (hasCompanies ? navigate(-1) : void signOut())}
            >
              {hasCompanies ? 'Voltar' : 'Sair'}
            </Button>
            <Button type="submit" disabled={busy || name.trim().length < 2}>
              {busy && <Loader2 className="animate-spin" />}
              Criar empresa
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
