import {
  Activity,
  ArrowLeftRight,
  Building2,
  Check,
  ChevronsUpDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { ROLE_LABELS, useActiveCompany, useCompany } from '@/providers/company-provider';

const NAV = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/pedidos', label: 'Vendas', icon: Receipt },
  { to: '/produtos', label: 'Produtos', icon: Package },
  { to: '/estoque', label: 'Estoque', icon: ArrowLeftRight },
  { to: '/clientes', label: 'Clientes', icon: Users },
  { to: '/diagnostico', label: 'Diagnóstico', icon: Activity },
];

function Brand() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 rounded-md px-1 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path d="M8 10.5h3.2l4.8 11 4.8-11H24l-6.6 14h-2.8z" fill="#fff" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">VendaHub</span>
    </Link>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Principal" className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
              isActive &&
                'bg-sidebar-accent font-medium text-sidebar-accent-foreground hover:bg-sidebar-accent',
            )
          }
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function CompanySwitcher() {
  const { me, selectCompany } = useCompany();
  const company = useActiveCompany();
  const companies = me?.companies ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md border bg-card px-2.5 py-2 text-left text-sm shadow-xs hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{company.name}</span>
            <span className="block text-xs text-muted-foreground">{ROLE_LABELS[company.role]}</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Empresas</DropdownMenuLabel>
        {companies.map((c) => (
          <DropdownMenuItem key={c.company_id} onSelect={() => selectCompany(c.company_id)}>
            <span className="flex-1 truncate">{c.company_name}</span>
            {c.company_id === company.id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/bem-vindo">
            <Plus /> Nova empresa
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserFooter() {
  const { me } = useCompany();
  const { signOut } = useAuth();
  const name = me?.user.full_name || me?.user.email || '';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
        {initials || '?'}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate font-medium">{me?.user.full_name || 'Usuário'}</p>
        <p className="truncate text-xs text-muted-foreground">{me?.user.email}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Sair"
        title="Sair"
        onClick={() => void signOut()}
      >
        <LogOut />
      </Button>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-5 p-3">
      <div className="px-1 pt-1">
        <Brand />
      </div>
      <CompanySwitcher />
      <Button asChild className="h-9 justify-start">
        <Link to="/pedidos/novo" onClick={onNavigate}>
          <Plus /> Nova venda
        </Link>
      </Button>
      <Navigation onNavigate={onNavigate} />
      <div className="mt-auto border-t pt-3">
        <UserFooter />
      </div>
    </div>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow"
      >
        Pular para o conteúdo
      </a>

      <aside className="sticky top-0 hidden h-dvh border-r bg-sidebar lg:block">
        <SidebarBody />
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <Button asChild size="sm">
            <Link to="/pedidos/novo">
              <Plus /> Venda
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Abrir menu" onClick={() => setOpen(true)}>
            <Menu />
          </Button>
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarBody onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <main
        id="conteudo"
        key={location.pathname}
        className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-7"
      >
        <div className="mx-auto max-w-7xl space-y-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
