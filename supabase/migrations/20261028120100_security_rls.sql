-- =============================================================================
-- VendaHub — segurança: Row Level Security e privilégios
--
-- Papéis:
--   owner   → tudo, inclusive dados da empresa
--   manager → produtos, estoque, clientes, pedidos e cancelamentos
--   seller  → consulta produtos; cadastra clientes; cria e avança pedidos
--
-- Regras gerais:
--   * anon não acessa nenhuma tabela.
--   * Cada linha só é visível para membros da empresa dona da linha.
--   * Pedidos, itens e movimentações de estoque são somente leitura para o
--     usuário: a escrita acontece exclusivamente pelas funções transacionais
--     (create_order, cancel_order, adjust_stock...), que validam papel e saldo.
--   * O saldo de estoque (products.stock_quantity) não pode ser alterado por
--     UPDATE direto; apenas pelas mesmas funções, que registram a movimentação.
-- =============================================================================

-- Empresas do usuário autenticado (opcionalmente filtradas por papel).
-- SECURITY DEFINER evita recursão de RLS ao consultar company_members.
create or replace function private.my_company_ids(p_roles public.member_role[] default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.company_id
  from public.company_members m
  where m.user_id = (select auth.uid())
    and (p_roles is null or m.role = any (p_roles));
$$;

create or replace function private.is_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_role(p_company_id uuid, p_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

revoke all on function private.my_company_ids(public.member_role[]) from public;
revoke all on function private.is_member(uuid) from public;
revoke all on function private.has_role(uuid, public.member_role[]) from public;
grant execute on function private.my_company_ids(public.member_role[]) to authenticated, service_role;
grant execute on function private.is_member(uuid) to authenticated, service_role;
grant execute on function private.has_role(uuid, public.member_role[]) to authenticated, service_role;

revoke all on function private.set_updated_at() from public;
revoke all on function private.handle_new_user() from public;
revoke all on function private.record_initial_stock() from public;

-- -----------------------------------------------------------------------------
-- RLS ligado em todas as tabelas
-- -----------------------------------------------------------------------------
alter table public.companies       enable row level security;
alter table public.profiles        enable row level security;
alter table public.company_members enable row level security;
alter table public.products        enable row level security;
alter table public.customers       enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.stock_movements enable row level security;

-- -----------------------------------------------------------------------------
-- Privilégios: começa fechado e libera só o necessário
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated;

grant update (name) on public.companies to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant insert (company_id, sku, name, description, price, cost, stock_quantity, min_stock)
  on public.products to authenticated;
grant update (sku, name, description, price, cost, min_stock, archived_at)
  on public.products to authenticated;
grant insert (company_id, name, email, phone, notes) on public.customers to authenticated;
grant update (name, email, phone, notes, archived_at) on public.customers to authenticated;

-- -----------------------------------------------------------------------------
-- Políticas
-- -----------------------------------------------------------------------------
-- companies
create policy companies_select on public.companies
  for select to authenticated
  using (id in (select private.my_company_ids()));

create policy companies_update_owner on public.companies
  for update to authenticated
  using (id in (select private.my_company_ids('{owner}')))
  with check (id in (select private.my_company_ids('{owner}')));

-- profiles: o próprio perfil e o de colegas da mesma empresa
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select m.user_id from public.company_members m
      where m.company_id in (select private.my_company_ids())
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- company_members: leitura para membros; gestão de equipe fora do escopo da UI
create policy company_members_select on public.company_members
  for select to authenticated
  using (company_id in (select private.my_company_ids()));

-- products
create policy products_select on public.products
  for select to authenticated
  using (company_id in (select private.my_company_ids()));

create policy products_insert_managers on public.products
  for insert to authenticated
  with check (company_id in (select private.my_company_ids('{owner,manager}')));

create policy products_update_managers on public.products
  for update to authenticated
  using (company_id in (select private.my_company_ids('{owner,manager}')))
  with check (company_id in (select private.my_company_ids('{owner,manager}')));

-- customers: qualquer membro atende clientes
create policy customers_select on public.customers
  for select to authenticated
  using (company_id in (select private.my_company_ids()));

create policy customers_insert on public.customers
  for insert to authenticated
  with check (company_id in (select private.my_company_ids()));

create policy customers_update on public.customers
  for update to authenticated
  using (company_id in (select private.my_company_ids()))
  with check (company_id in (select private.my_company_ids()));

-- orders, order_items, stock_movements: somente leitura
create policy orders_select on public.orders
  for select to authenticated
  using (company_id in (select private.my_company_ids()));

create policy order_items_select on public.order_items
  for select to authenticated
  using (company_id in (select private.my_company_ids()));

create policy stock_movements_select on public.stock_movements
  for select to authenticated
  using (company_id in (select private.my_company_ids()));
