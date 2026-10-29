-- =============================================================================
-- VendaHub — regras de negócio transacionais
--
-- Cada função roda dentro de UMA transação (a chamada RPC do PostgREST): ou
-- tudo é confirmado (pedido, itens, baixa de estoque e movimentações) ou nada.
--
-- Erros de negócio usam SQLSTATE próprios, traduzidos pela API em HTTP:
--   VH400 → dados inválidos        VH401 → não autenticado
--   VH403 → sem permissão          VH404 → não encontrado
--   VH409 → conflito de estado (estoque insuficiente, pedido já cancelado...)
--
-- Concorrência: a criação de pedidos trava a linha da empresa (numeração e
-- idempotência) e as linhas dos produtos em ordem de id (FOR UPDATE). Duas
-- vendas simultâneas do último item não passam as duas: a segunda espera a
-- primeira terminar e então encontra o saldo já baixado.
--
-- As funções private.* contêm a lógica e recebem usuário e data explícitos;
-- as funções public.* são a API: validam a sessão e o papel e as chamam.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Empresa: criação com o usuário atual como owner (onboarding)
-- -----------------------------------------------------------------------------
create or replace function public.create_company(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_company_id uuid;
begin
  if v_user is null then
    raise exception using errcode = 'VH401', message = 'NOT_AUTHENTICATED';
  end if;
  if (select count(*) from public.company_members m where m.user_id = v_user) >= 5 then
    raise exception using errcode = 'VH409', message = 'COMPANY_LIMIT_REACHED';
  end if;

  insert into public.companies (name) values (btrim(p_name)) returning id into v_company_id;
  insert into public.company_members (company_id, user_id, role) values (v_company_id, v_user, 'owner');
  return v_company_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Pedido: criação
-- -----------------------------------------------------------------------------
create or replace function private.create_order(
  p_company_id      uuid,
  p_user_id         uuid,
  p_items           jsonb,
  p_customer_id     uuid,
  p_discount        numeric,
  p_status          public.order_status,
  p_notes           text,
  p_idempotency_key uuid,
  p_created_at      timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing  public.orders;
  v_product   public.products;
  v_item      record;
  v_lines     jsonb := '[]'::jsonb;
  v_subtotal  numeric(12, 2) := 0;
  v_discount  numeric(12, 2) := round(coalesce(p_discount, 0), 2);
  v_number    integer;
  v_order_id  uuid;
begin
  if p_idempotency_key is null then
    raise exception using errcode = 'VH400', message = 'IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if p_status is null or p_status not in ('pending', 'paid') then
    raise exception using errcode = 'VH400', message = 'INVALID_INITIAL_STATUS';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception using errcode = 'VH400', message = 'ORDER_WITHOUT_ITEMS';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception using errcode = 'VH400', message = 'TOO_MANY_ITEMS';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as e
    where e ->> 'product_id' is null
       or jsonb_typeof(e -> 'quantity') <> 'number'
       or (e ->> 'quantity')::numeric <> trunc((e ->> 'quantity')::numeric)
       or (e ->> 'quantity')::numeric not between 1 and 100000
  ) then
    raise exception using errcode = 'VH400', message = 'INVALID_ORDER_ITEM';
  end if;
  if v_discount < 0 then
    raise exception using errcode = 'VH400', message = 'INVALID_DISCOUNT';
  end if;

  -- Serializa os pedidos da empresa (numeração e idempotência sem corrida).
  -- NO KEY UPDATE não bloqueia cadastros que só referenciam a empresa.
  perform 1 from public.companies c where c.id = p_company_id for no key update;
  if not found then
    raise exception using errcode = 'VH404', message = 'COMPANY_NOT_FOUND';
  end if;

  -- Requisição repetida (mesma chave): devolve o pedido já criado.
  select * into v_existing from public.orders o
  where o.company_id = p_company_id and o.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'id', v_existing.id, 'number', v_existing.number, 'status', v_existing.status,
      'subtotal', v_existing.subtotal, 'discount', v_existing.discount,
      'total', v_existing.total, 'replayed', true
    );
  end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = p_company_id and c.archived_at is null
  ) then
    raise exception using errcode = 'VH404', message = 'CUSTOMER_NOT_FOUND';
  end if;

  -- Trava cada produto (ordem estável evita deadlock), confere saldo e usa o
  -- preço do banco. Quantidades repetidas do mesmo produto são somadas.
  for v_item in
    select (e ->> 'product_id')::uuid as product_id,
           sum((e ->> 'quantity')::numeric)::integer as quantity
    from jsonb_array_elements(p_items) as e
    group by 1
    order by 1
  loop
    select * into v_product from public.products p
    where p.id = v_item.product_id and p.company_id = p_company_id
    for update;

    if not found or v_product.archived_at is not null then
      raise exception using errcode = 'VH404', message = 'PRODUCT_NOT_FOUND',
        detail = v_item.product_id::text;
    end if;
    if v_product.stock_quantity < v_item.quantity then
      raise exception using errcode = 'VH409', message = 'INSUFFICIENT_STOCK',
        detail = json_build_object(
          'product_id', v_product.id, 'sku', v_product.sku, 'name', v_product.name,
          'available', v_product.stock_quantity, 'requested', v_item.quantity
        )::text;
    end if;

    v_subtotal := v_subtotal + v_product.price * v_item.quantity;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id, 'product_name', v_product.name,
      'product_sku', v_product.sku, 'quantity', v_item.quantity,
      'unit_price', v_product.price, 'unit_cost', v_product.cost
    );
  end loop;

  if v_discount > v_subtotal then
    raise exception using errcode = 'VH400', message = 'DISCOUNT_EXCEEDS_SUBTOTAL';
  end if;

  update public.companies c set order_seq = c.order_seq + 1
  where c.id = p_company_id
  returning c.order_seq into v_number;

  insert into public.orders (
    company_id, number, customer_id, status, subtotal, discount, total, notes,
    idempotency_key, created_by, created_at, updated_at, paid_at
  ) values (
    p_company_id, v_number, p_customer_id, p_status, v_subtotal, v_discount,
    v_subtotal - v_discount, nullif(btrim(p_notes), ''), p_idempotency_key, p_user_id,
    p_created_at, p_created_at, case when p_status = 'paid' then p_created_at end
  )
  returning id into v_order_id;

  insert into public.order_items
    (order_id, company_id, product_id, product_name, product_sku, quantity, unit_price, unit_cost)
  select v_order_id, p_company_id, l.product_id, l.product_name, l.product_sku,
         l.quantity, l.unit_price, l.unit_cost
  from jsonb_to_recordset(v_lines) as l(
    product_id uuid, product_name text, product_sku text,
    quantity integer, unit_price numeric, unit_cost numeric
  );

  -- Baixa do estoque + movimentação, na mesma transação.
  with updated as (
    update public.products p
    set stock_quantity = p.stock_quantity - l.quantity
    from jsonb_to_recordset(v_lines) as l(product_id uuid, quantity integer)
    where p.id = l.product_id
    returning p.id, p.stock_quantity, l.quantity
  )
  insert into public.stock_movements
    (company_id, product_id, type, quantity, balance_after, order_id, reason, created_by, created_at)
  select p_company_id, u.id, 'sale', -u.quantity, u.stock_quantity, v_order_id,
         format('Venda — pedido #%s', v_number), p_user_id, p_created_at
  from updated u;

  return jsonb_build_object(
    'id', v_order_id, 'number', v_number, 'status', p_status,
    'subtotal', v_subtotal, 'discount', v_discount,
    'total', v_subtotal - v_discount, 'replayed', false
  );
end;
$$;

create or replace function public.create_order(
  p_company_id      uuid,
  p_items           jsonb,
  p_idempotency_key uuid,
  p_customer_id     uuid default null,
  p_discount        numeric default 0,
  p_status          public.order_status default 'pending',
  p_notes           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'VH401', message = 'NOT_AUTHENTICATED';
  end if;
  if not private.is_member(p_company_id) then
    raise exception using errcode = 'VH403', message = 'NOT_A_MEMBER';
  end if;
  return private.create_order(
    p_company_id, (select auth.uid()), p_items, p_customer_id, p_discount,
    p_status, p_notes, p_idempotency_key, now()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Pedido: avanço de status (pending → paid → completed; pending → completed)
-- -----------------------------------------------------------------------------
create or replace function private.set_order_status(
  p_order_id uuid,
  p_status   public.order_status,
  p_at       timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception using errcode = 'VH404', message = 'ORDER_NOT_FOUND';
  end if;

  if p_status = 'canceled' then
    raise exception using errcode = 'VH400', message = 'USE_CANCEL_ORDER';
  end if;
  if not (
    (v_order.status = 'pending' and p_status in ('paid', 'completed'))
    or (v_order.status = 'paid' and p_status = 'completed')
  ) then
    raise exception using errcode = 'VH409', message = 'INVALID_STATUS_TRANSITION',
      detail = format('%s -> %s', v_order.status, p_status);
  end if;

  update public.orders o
  set status = p_status,
      paid_at = coalesce(o.paid_at, p_at),
      completed_at = case when p_status = 'completed' then p_at else o.completed_at end
  where o.id = p_order_id;

  return jsonb_build_object('id', v_order.id, 'number', v_order.number,
                            'company_id', v_order.company_id, 'status', p_status);
end;
$$;

create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'VH401', message = 'NOT_AUTHENTICATED';
  end if;
  select o.company_id into v_company_id from public.orders o where o.id = p_order_id;
  if v_company_id is null or not private.is_member(v_company_id) then
    raise exception using errcode = 'VH404', message = 'ORDER_NOT_FOUND';
  end if;
  return private.set_order_status(p_order_id, p_status, now());
end;
$$;

-- -----------------------------------------------------------------------------
-- Pedido: cancelamento com devolução ao estoque
--   * permitido em pending e paid; completed e canceled são finais;
--   * o pedido é travado (FOR UPDATE): dois cancelamentos simultâneos não
--     devolvem o estoque duas vezes — o segundo recebe ORDER_ALREADY_CANCELED;
--   * o índice único de movimentações reforça a regra no nível do banco.
-- -----------------------------------------------------------------------------
create or replace function private.cancel_order(
  p_order_id uuid,
  p_user_id  uuid,
  p_reason   text,
  p_at       timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception using errcode = 'VH404', message = 'ORDER_NOT_FOUND';
  end if;
  if v_order.status = 'canceled' then
    raise exception using errcode = 'VH409', message = 'ORDER_ALREADY_CANCELED';
  end if;
  if v_order.status = 'completed' then
    raise exception using errcode = 'VH409', message = 'ORDER_COMPLETED';
  end if;

  perform 1 from public.products p
  where p.id in (select i.product_id from public.order_items i where i.order_id = p_order_id)
  order by p.id
  for update;

  with restored as (
    update public.products p
    set stock_quantity = p.stock_quantity + i.quantity
    from public.order_items i
    where i.order_id = p_order_id and p.id = i.product_id
    returning p.id, p.stock_quantity, i.quantity
  )
  insert into public.stock_movements
    (company_id, product_id, type, quantity, balance_after, order_id, reason, created_by, created_at)
  select v_order.company_id, r.id, 'cancellation', r.quantity, r.stock_quantity, p_order_id,
         format('Cancelamento — pedido #%s', v_order.number), p_user_id, p_at
  from restored r;

  update public.orders o
  set status = 'canceled', canceled_at = p_at, canceled_by = p_user_id,
      cancel_reason = nullif(btrim(p_reason), '')
  where o.id = p_order_id;

  return jsonb_build_object('id', v_order.id, 'number', v_order.number,
                            'company_id', v_order.company_id, 'status', 'canceled');
end;
$$;

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'VH401', message = 'NOT_AUTHENTICATED';
  end if;
  select o.company_id into v_company_id from public.orders o where o.id = p_order_id;
  if v_company_id is null or not private.is_member(v_company_id) then
    raise exception using errcode = 'VH404', message = 'ORDER_NOT_FOUND';
  end if;
  if not private.has_role(v_company_id, '{owner,manager}') then
    raise exception using errcode = 'VH403', message = 'ROLE_REQUIRED';
  end if;
  return private.cancel_order(p_order_id, (select auth.uid()), p_reason, now());
end;
$$;

-- -----------------------------------------------------------------------------
-- Estoque: entrada por compra ou ajuste manual
-- -----------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_quantity   integer,
  p_type       public.stock_movement_type,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products;
  v_balance integer;
  v_movement_id bigint;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'VH401', message = 'NOT_AUTHENTICATED';
  end if;
  if p_type not in ('purchase', 'adjustment') then
    raise exception using errcode = 'VH400', message = 'INVALID_MOVEMENT_TYPE';
  end if;
  if p_quantity is null or p_quantity = 0 or abs(p_quantity) > 100000
     or (p_type = 'purchase' and p_quantity < 0) then
    raise exception using errcode = 'VH400', message = 'INVALID_QUANTITY';
  end if;
  if p_type = 'adjustment' and nullif(btrim(p_reason), '') is null then
    raise exception using errcode = 'VH400', message = 'REASON_REQUIRED';
  end if;

  select * into v_product from public.products p where p.id = p_product_id for update;
  if not found or not private.is_member(v_product.company_id) then
    raise exception using errcode = 'VH404', message = 'PRODUCT_NOT_FOUND';
  end if;
  if not private.has_role(v_product.company_id, '{owner,manager}') then
    raise exception using errcode = 'VH403', message = 'ROLE_REQUIRED';
  end if;
  if v_product.archived_at is not null then
    raise exception using errcode = 'VH409', message = 'PRODUCT_ARCHIVED';
  end if;

  v_balance := v_product.stock_quantity + p_quantity;
  if v_balance < 0 then
    raise exception using errcode = 'VH409', message = 'NEGATIVE_STOCK',
      detail = json_build_object('available', v_product.stock_quantity, 'requested', p_quantity)::text;
  end if;

  update public.products p set stock_quantity = v_balance where p.id = p_product_id;

  insert into public.stock_movements
    (company_id, product_id, type, quantity, balance_after, reason, created_by)
  values
    (v_product.company_id, p_product_id, p_type, p_quantity, v_balance,
     nullif(btrim(p_reason), ''), (select auth.uid()))
  returning id into v_movement_id;

  return jsonb_build_object('product_id', p_product_id, 'company_id', v_product.company_id,
                            'stock_quantity', v_balance, 'movement_id', v_movement_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Privilégios das funções
-- -----------------------------------------------------------------------------
revoke all on function private.create_order(uuid, uuid, jsonb, uuid, numeric, public.order_status, text, uuid, timestamptz) from public;
revoke all on function private.set_order_status(uuid, public.order_status, timestamptz) from public;
revoke all on function private.cancel_order(uuid, uuid, text, timestamptz) from public;

revoke all on function public.create_company(text) from public, anon;
revoke all on function public.create_order(uuid, jsonb, uuid, uuid, numeric, public.order_status, text) from public, anon;
revoke all on function public.set_order_status(uuid, public.order_status) from public, anon;
revoke all on function public.cancel_order(uuid, text) from public, anon;
revoke all on function public.adjust_stock(uuid, integer, public.stock_movement_type, text) from public, anon;

grant execute on function public.create_company(text) to authenticated;
grant execute on function public.create_order(uuid, jsonb, uuid, uuid, numeric, public.order_status, text) to authenticated;
grant execute on function public.set_order_status(uuid, public.order_status) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.adjust_stock(uuid, integer, public.stock_movement_type, text) to authenticated;
