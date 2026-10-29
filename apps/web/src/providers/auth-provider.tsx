import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(
    email: string,
    password: string,
    fullName: string,
  ): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar (veja a caixa de entrada).',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  weak_password: 'Senha fraca: use pelo menos 8 caracteres.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde um pouco e tente de novo.',
};

function authError(error: { code?: string; message: string }): Error {
  return new Error(
    (error.code && AUTH_MESSAGES[error.code]) || 'Não foi possível autenticar. Tente novamente.',
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw authError(error);
      },
      async signUp(email, password, fullName) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
        });
        if (error) throw authError(error);
        return { needsConfirmation: !data.session };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth fora do AuthProvider');
  return context;
}
