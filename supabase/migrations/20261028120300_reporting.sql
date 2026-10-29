-- =============================================================================
-- VendaHub — consultas de indicadores
--
-- Todas usam SECURITY INVOKER: rodam com as permissões de quem chama, então o
-- RLS continua valendo. A checagem explícita de associação só melhora a
-- mensagem de erro (sem ela, um não membro receberia indicadores zerados).
--
-- Faturamento considera pedidos pagos ou concluídos, pela data de criação do
-- pedido, no fuso informado. Pendentes aparecem como "a receber".
-- =============================================================================

create or replace function public.dashboard_summary(
  p_company_id uuid,
  p_from       date,
  p_to         date,
  p_tz         text default 'America/Sao_Paulo'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_days        integer;
  v_start       timestamptz;
  v_end         timestamptz;
  v_prev_start  timestamptz;
  v_kpis        jsonb;
  v_previous    jsonb;
  v_items_sold  bigint;
  v_cost        numeric;
  v_revenue     numeric;
  v_by_day      jsonb;
  v_top         jsonb;
  v_low_stock   jsonb;
  v_status      jsonb;
begin
  if not private.is_member(p_company_id) then
    raise exception using errcode = 'VH403', message = 'NOT_A_MEMBER';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception using errcode = 'VH400', message = 'INVALID_PERIOD';
  end if;
  v_days := p_to - p_from + 1;
  if v_days > 366 then
    raise exception using errcode = 'VH400', message = 'PERIOD_TOO_LONG';
  end if;
  begin
    perform now() at time zone p_tz;
  exception when others then
    raise exception using errcode = 'VH400', message = 'INVALID_TIMEZONE';
  end;

  v_start      := p_from::timestamp at time zone p_tz;
  v_end        := (p_to + 1)::timestamp at time zone p_tz;
  v_prev_start := (p_from - v_days)::timestamp at time zone p_tz;

  -- Indicadores do período
  select
    coalesce(sum(o.total) filter (where o.status in ('paid', 'completed')), 0),
    jsonb_build_object(
      'orders',           count(*) filter (where o.status <> 'canceled'),
      'paid_orders',      count(*) filter (where o.status in ('paid', 'completed')),
      'pending_orders',   count(*) filter (where o.status = 'pending'),
      'pending_amount',   coalesce(sum(o.total) filter (where o.status = 'pending'), 0),
      'canceled_orders',  count(*) filter (where o.status = 'canceled'),
      'discounts',        coalesce(sum(o.discount) filter (where o.status in ('paid', 'completed')), 0),
      'active_customers', count(distinct o.customer_id) filter (where o.status <> 'canceled'),
      'average_ticket',   round(
        sum(o.total) filter (where o.status in ('paid', 'completed'))
        / nullif(count(*) filter (where o.status in ('paid', 'completed')), 0), 2)
    )
  into v_revenue, v_kpis
  from public.orders o
  where o.company_id = p_company_id and o.created_at >= v_start and o.created_at < v_end;

  select coalesce(sum(i.quantity), 0), coalesce(sum(i.quantity * i.unit_cost), 0)
  into v_items_sold, v_cost
  from public.order_items i
  join public.orders o on o.id = i.order_id
  where o.company_id = p_company_id
    and o.status in ('paid', 'completed')
    and o.created_at >= v_start and o.created_at < v_end;

  v_kpis := v_kpis || jsonb_build_object(
    'revenue',      v_revenue,
    'items_sold',   v_items_sold,
    'gross_profit', v_revenue - v_cost,
    'gross_margin', case when v_revenue > 0 then round((v_revenue - v_cost) / v_revenue * 100, 1) end
  );

  -- Período anterior de mesmo tamanho (comparação)
  select jsonb_build_object(
    'revenue',        coalesce(sum(o.total) filter (where o.status in ('paid', 'completed')), 0),
    'orders',         count(*) filter (where o.status <> 'canceled'),
    'paid_orders',    count(*) filter (where o.status in ('paid', 'completed')),
    'average_ticket', round(
      sum(o.total) filter (where o.status in ('paid', 'completed'))
      / nullif(count(*) filter (where o.status in ('paid', 'completed')), 0), 2)
  )
  into v_previous
  from public.orders o
  where o.company_id = p_company_id and o.created_at >= v_prev_start and o.created_at < v_start;

  -- Série diária (dias sem venda aparecem com zero)
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', d.day, 'revenue', coalesce(s.revenue, 0), 'orders', coalesce(s.orders, 0)
         ) order by d.day), '[]'::jsonb)
  into v_by_day
  from (
    select g::date as day from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g
  ) d
  left join (
    select (o.created_at at time zone p_tz)::date as day,
           sum(o.total) filter (where o.status in ('paid', 'completed')) as revenue,
           count(*) filter (where o.status <> 'canceled') as orders
    from public.orders o
    where o.company_id = p_company_id and o.created_at >= v_start and o.created_at < v_end
    group by 1
  ) s on s.day = d.day;

  -- Produtos mais vendidos (quantidade) no período
  select coalesce(jsonb_agg(t order by t.quantity desc, t.revenue desc), '[]'::jsonb)
  into v_top
  from (
    select i.product_id, max(i.product_name) as name, max(i.product_sku) as sku,
           sum(i.quantity)::integer as quantity, sum(i.line_total) as revenue
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where o.company_id = p_company_id
      and o.status in ('paid', 'completed')
      and o.created_at >= v_start and o.created_at < v_end
    group by i.product_id
    order by sum(i.quantity) desc, sum(i.line_total) desc
    limit 5
  ) t;

  -- Estoque baixo (situação atual, independe do período)
  select jsonb_build_object(
    'count', (select count(*) from public.products p
              where p.company_id = p_company_id and p.archived_at is null
                and p.stock_quantity <= p.min_stock),
    'items', coalesce(jsonb_agg(l order by l.shortage desc, l.name), '[]'::jsonb)
  )
  into v_low_stock
  from (
    select p.id, p.name, p.sku, p.stock_quantity, p.min_stock,
           p.min_stock - p.stock_quantity as shortage
    from public.products p
    where p.company_id = p_company_id and p.archived_at is null
      and p.stock_quantity <= p.min_stock
    order by p.min_stock - p.stock_quantity desc, p.name
    limit 8
  ) l;

  select coalesce(jsonb_object_agg(s.status, s.total), '{}'::jsonb)
  into v_status
  from (
    select o.status, count(*) as total
    from public.orders o
    where o.company_id = p_company_id and o.created_at >= v_start and o.created_at < v_end
    group by o.status
  ) s;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'days', v_days, 'timezone', p_tz),
    'previous_period', jsonb_build_object('from', p_from - v_days, 'to', p_from - 1),
    'kpis', v_kpis,
    'previous', v_previous,
    'sales_by_day', v_by_day,
    'top_products', v_top,
    'low_stock', v_low_stock,
    'status_breakdown', v_status,
    'generated_at', now()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Clientes com indicadores de relacionamento
-- -----------------------------------------------------------------------------
create or replace view public.customer_summaries
with (security_invoker = true)
as
select
  c.id, c.company_id, c.name, c.email, c.phone, c.notes, c.archived_at, c.created_at, c.updated_at,
  coalesce(s.orders_count, 0)  as orders_count,
  coalesce(s.total_spent, 0)   as total_spent,
  s.last_order_at
from public.customers c
left join lateral (
  select
    count(*) filter (where o.status <> 'canceled')                   as orders_count,
    sum(o.total) filter (where o.status in ('paid', 'completed'))     as total_spent,
    max(o.created_at) filter (where o.status <> 'canceled')          as last_order_at
  from public.orders o
  where o.customer_id = c.id and o.company_id = c.company_id
) s on true;

revoke all on public.customer_summaries from anon;
revoke insert, update, delete, truncate, references, trigger on public.customer_summaries from authenticated;
grant select on public.customer_summaries to authenticated;

create or replace function public.customer_insights(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_customer public.customers;
  v_stats    jsonb;
  v_top      jsonb;
begin
  -- RLS: não membros simplesmente não encontram o cliente.
  select * into v_customer from public.customers c where c.id = p_customer_id;
  if not found then
    raise exception using errcode = 'VH404', message = 'CUSTOMER_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'orders_count',    count(*) filter (where o.status <> 'canceled'),
    'canceled_count',  count(*) filter (where o.status = 'canceled'),
    'total_spent',     coalesce(sum(o.total) filter (where o.status in ('paid', 'completed')), 0),
    'pending_amount',  coalesce(sum(o.total) filter (where o.status = 'pending'), 0),
    'average_ticket',  round(
      sum(o.total) filter (where o.status in ('paid', 'completed'))
      / nullif(count(*) filter (where o.status in ('paid', 'completed')), 0), 2),
    'first_order_at',  min(o.created_at) filter (where o.status <> 'canceled'),
    'last_order_at',   max(o.created_at) filter (where o.status <> 'canceled'),
    'days_since_last_order', (current_date - (max(o.created_at) filter (where o.status <> 'canceled'))::date)
  )
  into v_stats
  from public.orders o
  where o.customer_id = p_customer_id and o.company_id = v_customer.company_id;

  select coalesce(jsonb_agg(t order by t.quantity desc), '[]'::jsonb)
  into v_top
  from (
    select i.product_id, max(i.product_name) as name, sum(i.quantity)::integer as quantity,
           sum(i.line_total) as revenue
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where o.customer_id = p_customer_id and o.company_id = v_customer.company_id
      and o.status in ('paid', 'completed')
    group by i.product_id
    order by sum(i.quantity) desc
    limit 5
  ) t;

  return v_stats || jsonb_build_object('top_products', v_top);
end;
$$;

revoke all on function public.dashboard_summary(uuid, date, date, text) from public, anon;
revoke all on function public.customer_insights(uuid) from public, anon;
grant execute on function public.dashboard_summary(uuid, date, date, text) to authenticated, service_role;
grant execute on function public.customer_insights(uuid) to authenticated, service_role;
