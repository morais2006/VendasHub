-- =============================================================================
-- VendaHub — esquema base
-- Empresas, perfis, membros, produtos, clientes, pedidos, itens e movimentações
-- de estoque. Valores monetários em numeric(12,2); quantidades em unidades
-- inteiras. Toda tabela de negócio carrega company_id (multiempresa) e as
-- chaves estrangeiras compostas (id, company_id) impedem que um pedido aponte
-- para produto ou cliente de outra empresa.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- Funções internas (triggers e checagens de acesso) ficam fora do schema
-- exposto pela API REST.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.member_role as enum ('owner', 'manager', 'seller');
create type public.order_status as enum ('pending', 'paid', 'completed', 'canceled');
create type public.stock_movement_type as enum (
  'initial',      -- estoque informado no cadastro do produto
  'purchase',     -- entrada por compra/reposição
  'adjustment',   -- correção manual (inventário, perda, avaria)
  'sale',         -- baixa por pedido
  'cancellation'  -- devolução ao estoque por cancelamento de pedido
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Empresas e usuários
-- -----------------------------------------------------------------------------
create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 120),
  -- Contador da numeração sequencial de pedidos (#1, #2...) por empresa.
  order_seq   integer not null default 0 check (order_seq >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.company_members (
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.member_role not null default 'seller',
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);
create index company_members_user_idx on public.company_members (user_id);

-- -----------------------------------------------------------------------------
-- Produtos
-- -----------------------------------------------------------------------------
create table public.products (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies (id) on delete cascade,
  sku             text not null check (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  name            text not null check (char_length(btrim(name)) between 2 and 120),
  description     text check (char_length(description) <= 1000),
  price           numeric(12, 2) not null check (price >= 0),
  cost            numeric(12, 2) not null default 0 check (cost >= 0),
  -- Saldo atual. Só muda por funções que registram a movimentação
  -- correspondente (ver migração de regras de negócio).
  stock_quantity  integer not null default 0 check (stock_quantity >= 0),
  min_stock       integer not null default 0 check (min_stock >= 0),
  -- Coluna derivada para filtrar "estoque baixo" pela API REST.
  is_low_stock    boolean generated always as (stock_quantity <= min_stock) stored,
  -- Exclusão lógica: produtos vendidos continuam referenciados no histórico.
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, company_id)
);
create unique index products_company_sku_key on public.products (company_id, lower(sku));
create index products_company_name_idx on public.products (company_id, name);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create index products_low_stock_idx on public.products (company_id)
  where archived_at is null and is_low_stock;

-- -----------------------------------------------------------------------------
-- Clientes (apenas os dados necessários para vender e manter contato)
-- -----------------------------------------------------------------------------
create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 2 and 120),
  email        text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone        text check (phone is null or phone ~ '^[0-9+() -]{8,20}$'),
  notes        text check (char_length(notes) <= 500),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, company_id)
);
create unique index customers_company_email_key on public.customers (company_id, lower(email))
  where email is not null;
create index customers_company_name_idx on public.customers (company_id, name);
create index customers_name_trgm_idx on public.customers using gin (name extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Pedidos
--   pending   → registrado, aguardando pagamento (estoque já baixado/reservado)
--   paid      → pagamento confirmado
--   completed → entregue/finalizado (estado final)
--   canceled  → cancelado, estoque devolvido (estado final)
-- -----------------------------------------------------------------------------
create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  number           integer not null check (number > 0),
  customer_id      uuid,
  status           public.order_status not null default 'pending',
  subtotal         numeric(12, 2) not null check (subtotal >= 0),
  discount         numeric(12, 2) not null default 0 check (discount >= 0 and discount <= subtotal),
  total            numeric(12, 2) not null check (total = subtotal - discount),
  notes            text check (char_length(notes) <= 500),
  -- Gerada pelo cliente a cada tentativa de venda: repetir a requisição
  -- devolve o mesmo pedido em vez de baixar o estoque duas vezes.
  idempotency_key  uuid not null,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  paid_at          timestamptz,
  completed_at     timestamptz,
  canceled_at      timestamptz,
  canceled_by      uuid references public.profiles (id) on delete set null,
  cancel_reason    text check (char_length(cancel_reason) <= 300),
  unique (company_id, number),
  unique (company_id, idempotency_key),
  unique (id, company_id),
  foreign key (customer_id, company_id) references public.customers (id, company_id),
  check ((status = 'canceled') = (canceled_at is not null)),
  check (status <> 'completed' or completed_at is not null)
);
create index orders_company_created_idx on public.orders (company_id, created_at desc);
create index orders_company_status_created_idx on public.orders (company_id, status, created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc)
  where customer_id is not null;

-- Preço e custo são copiados do produto no momento da venda: alterar o
-- cadastro depois não muda pedidos antigos.
create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null,
  company_id    uuid not null,
  product_id    uuid not null,
  product_name  text not null,
  product_sku   text not null,
  quantity      integer not null check (quantity > 0),
  unit_price    numeric(12, 2) not null check (unit_price >= 0),
  unit_cost     numeric(12, 2) not null check (unit_cost >= 0),
  line_total    numeric(12, 2) generated always as (quantity * unit_price) stored,
  foreign key (order_id, company_id) references public.orders (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id),
  unique (order_id, product_id)
);
create index order_items_company_product_idx on public.order_items (company_id, product_id);

-- -----------------------------------------------------------------------------
-- Movimentações de estoque (trilha de auditoria, somente inserção)
-- -----------------------------------------------------------------------------
create table public.stock_movements (
  id             bigint generated always as identity primary key,
  company_id     uuid not null references public.companies (id) on delete cascade,
  product_id     uuid not null,
  type           public.stock_movement_type not null,
  -- Variação assinada: negativa na venda, positiva na entrada/cancelamento.
  quantity       integer not null check (quantity <> 0),
  balance_after  integer not null check (balance_after >= 0),
  order_id       uuid,
  reason         text check (char_length(reason) <= 300),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  foreign key (product_id, company_id) references public.products (id, company_id),
  foreign key (order_id, company_id) references public.orders (id, company_id),
  check ((type in ('sale', 'cancellation')) = (order_id is not null)),
  check (
    (type = 'sale' and quantity < 0)
    or (type in ('cancellation', 'initial', 'purchase') and quantity > 0)
    or type = 'adjustment'
  )
);
-- Uma única baixa e uma única devolução por produto em cada pedido.
create unique index stock_movements_order_once_key
  on public.stock_movements (order_id, product_id, type) where order_id is not null;
create index stock_movements_product_idx on public.stock_movements (company_id, product_id, created_at desc);
create index stock_movements_company_idx on public.stock_movements (company_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
create trigger companies_updated_at before update on public.companies
  for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger products_updated_at before update on public.products
  for each row execute function private.set_updated_at();
create trigger customers_updated_at before update on public.customers
  for each row execute function private.set_updated_at();
create trigger orders_updated_at before update on public.orders
  for each row execute function private.set_updated_at();

-- Cria o perfil de cada novo usuário do Supabase Auth.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(left(btrim(new.raw_user_meta_data ->> 'full_name'), 120), ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Estoque informado no cadastro vira a primeira movimentação do produto.
create or replace function private.record_initial_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stock_quantity > 0 then
    insert into public.stock_movements
      (company_id, product_id, type, quantity, balance_after, reason, created_by)
    values
      (new.company_id, new.id, 'initial', new.stock_quantity, new.stock_quantity,
       'Estoque inicial no cadastro', (select auth.uid()));
  end if;
  return null;
end;
$$;

create trigger products_initial_stock after insert on public.products
  for each row execute function private.record_initial_stock();
