import '@/index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { ErrorState } from '@/components/states';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppLayout } from '@/layouts/app-layout';
import { ApiError } from '@/lib/api';
import { supabaseConfigured } from '@/lib/supabase';
import { LoginPage } from '@/pages/login-page';
import { OnboardingPage } from '@/pages/onboarding-page';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { CompanyProvider, useCompany } from '@/providers/company-provider';

const DashboardPage = lazy(() => import('@/pages/dashboard-page'));
const OrdersPage = lazy(() => import('@/pages/orders-page'));
const NewOrderPage = lazy(() => import('@/pages/new-order-page'));
const OrderDetailPage = lazy(() => import('@/pages/order-detail-page'));
const ProductsPage = lazy(() => import('@/pages/products-page'));
const ProductDetailPage = lazy(() => import('@/pages/product-detail-page'));
const StockPage = lazy(() => import('@/pages/stock-page'));
const CustomersPage = lazy(() => import('@/pages/customers-page'));
const CustomerDetailPage = lazy(() => import('@/pages/customer-detail-page'));
const DiagnosticsPage = lazy(() => import('@/pages/diagnostics-page'));
const NotFoundPage = lazy(() => import('@/pages/not-found-page'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // Erros 4xx (permissão, validação, não encontrado) não melhoram com nova tentativa.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Carregando" />
    </div>
  );
}

function RequireSession({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/entrar" replace />;
  return children;
}

/** Usuário sem empresa vai para o cadastro da primeira empresa. */
function RequireCompany() {
  const { company, loading, error, refresh } = useCompany();
  if (loading) return <FullScreenLoader />;
  if (error)
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorState error={error} onRetry={() => void refresh()} />
      </div>
    );
  if (!company) return <Navigate to="/bem-vindo" replace />;
  return <Outlet />;
}

function PageSuspense() {
  return (
    <Suspense
      fallback={
        <div className="grid h-60 place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Carregando" />
        </div>
      }
    >
      <Outlet />
    </Suspense>
  );
}

function MissingConfig() {
  return (
    <div className="mx-auto max-w-xl space-y-3 p-8">
      <h1 className="text-xl font-semibold">Configuração incompleta</h1>
      <p className="text-sm text-muted-foreground">
        O front-end não recebeu <code>SUPABASE_URL</code> e <code>SUPABASE_PUBLISHABLE_KEY</code>.
        Copie <code>.env.example</code> para <code>.env</code> na raiz do projeto, preencha os
        valores e reinicie <code>npm run dev</code>.
      </p>
    </div>
  );
}

const router = createBrowserRouter([
  { path: '/entrar', element: <LoginPage /> },
  {
    element: (
      <RequireSession>
        <Outlet />
      </RequireSession>
    ),
    children: [
      { path: '/bem-vindo', element: <OnboardingPage /> },
      {
        element: <RequireCompany />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                element: <PageSuspense />,
                children: [
                  { index: true, element: <DashboardPage /> },
                  { path: 'pedidos', element: <OrdersPage /> },
                  { path: 'pedidos/novo', element: <NewOrderPage /> },
                  { path: 'pedidos/:id', element: <OrderDetailPage /> },
                  { path: 'produtos', element: <ProductsPage /> },
                  { path: 'produtos/:id', element: <ProductDetailPage /> },
                  { path: 'estoque', element: <StockPage /> },
                  { path: 'clientes', element: <CustomersPage /> },
                  { path: 'clientes/:id', element: <CustomerDetailPage /> },
                  { path: 'diagnostico', element: <DiagnosticsPage /> },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfigured ? (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CompanyProvider>
            <TooltipProvider delayDuration={200}>
              <RouterProvider router={router} />
              <Toaster position="top-right" richColors closeButton />
            </TooltipProvider>
          </CompanyProvider>
        </AuthProvider>
      </QueryClientProvider>
    ) : (
      <MissingConfig />
    )}
  </StrictMode>,
);
