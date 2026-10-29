-- =============================================================================
-- VendaHub — gerador de histórico de vendas para DEMONSTRAÇÃO
--
-- Usado apenas por `npm run db:seed` (chave secreta / service_role). Gera
-- pedidos fictícios distribuídos nos últimos dias, passando pelas MESMAS
-- funções transacionais do sistema (private.create_order, set_order_status e
-- cancel_order), só que com datas retroativas. Assim estoque, movimentações e
-- totais do histórico seguem exatamente as regras reais.
--
-- Não pode ser executada por usuários autenticados nem anônimos.
-- =============================================================================

create or replace function public.seed_demo_sales(
  p_company_id uuid,
  p_user_ids   uuid[],
  p_orders     integer,
  p_days       integer,
  p_seed       double precision default 0.42,
  p_tz         text default 'America/Sao_Paulo'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at        timestamptz;
  v_items     jsonb;
  v_customer  uuid;
  v_result    jsonb;
  v_roll      double precision;
  v_created   integer := 0;
  v_age_days  double precision;
  v_user      uuid;
begin
  if coalesce(array_length(p_user_ids, 1), 0) = 0 then
    raise exception using errcode = 'VH400', message = 'SEED_USERS_REQUIRED';
  end if;

  perform setseed(p_seed);

  -- O estoque inicial do cadastro passa a ser anterior ao histórico gerado.
  update public.stock_movements m
  set created_at = now() - make_interval(days => p_days + 5)
  where m.company_id = p_company_id and m.type = 'initial';

  for v_at in
    select least(
             (date_trunc('day', (now() - ((random() ^ 1.3) * p_days) * interval '1 day') at time zone p_tz)
               + make_interval(hours => 9 + floor(random() * 11)::integer,
                               mins  => floor(random() * 60)::integer)) at time zone p_tz,
             now() - interval '10 minutes')
    from generate_series(1, p_orders)
    order by 1
  loop
    -- 1 a 4 produtos ativos com saldo, 1 a 3 unidades de cada.
    select jsonb_agg(jsonb_build_object('product_id', x.id, 'quantity', x.qty))
    into v_items
    from (
      select p.id, least(p.stock_quantity, 1 + floor(random() * 3)::integer) as qty
      from public.products p
      where p.company_id = p_company_id and p.archived_at is null and p.stock_quantity > 0
      order by random()
      limit 1 + floor(random() * 4)::integer
    ) x;

    continue when v_items is null;

    -- 75% dos pedidos com cliente identificado.
    v_customer := null;
    if random() < 0.75 then
      select c.id into v_customer from public.customers c
      where c.company_id = p_company_id and c.archived_at is null
      order by random() limit 1;
    end if;

    v_user := p_user_ids[1 + floor(random() * array_length(p_user_ids, 1))::integer];
    v_age_days := extract(epoch from now() - v_at) / 86400;

    v_result := private.create_order(
      p_company_id, v_user, v_items, v_customer,
      case when random() < 0.12 then 5 else 0 end,
      'pending', null, gen_random_uuid(), v_at
    );

    v_roll := random();
    if v_age_days > 3 then
      if v_roll < 0.07 then
        perform private.cancel_order((v_result ->> 'id')::uuid, v_user, 'Cliente desistiu da compra',
                                     v_at + interval '2 hours');
      elsif v_roll < 0.15 then
        perform private.set_order_status((v_result ->> 'id')::uuid, 'paid', v_at + interval '20 minutes');
      else
        perform private.set_order_status((v_result ->> 'id')::uuid, 'paid', v_at + interval '20 minutes');
        perform private.set_order_status((v_result ->> 'id')::uuid, 'completed', v_at + interval '1 day');
      end if;
    elsif v_roll < 0.6 then
      perform private.set_order_status((v_result ->> 'id')::uuid, 'paid',
                                       least(v_at + interval '20 minutes', now()));
    end if;

    v_created := v_created + 1;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.seed_demo_sales(uuid, uuid[], integer, integer, double precision, text)
  from public, anon, authenticated;
grant execute on function public.seed_demo_sales(uuid, uuid[], integer, integer, double precision, text)
  to service_role;
