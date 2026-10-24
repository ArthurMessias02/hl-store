-- ============================================================
-- HL STORE — SISTEMA DE CUPONS (migração)
-- ------------------------------------------------------------
-- Como usar: Supabase > SQL Editor > cole este arquivo > Run.
-- Rode DEPOIS de db/schema.sql. É idempotente (pode rodar de novo sem duplicar
-- nada) e NÃO altera nem apaga nenhuma tabela existente (products, categories,
-- promotions, customers...). Só cria objetos novos.
--
-- O que cria:
--   coupons              cupons (só o administrador lê e escreve)
--   coupon_redemptions   reservas e usos de cupom (só o administrador lê)
--   validate_coupon()    visitante: "este cupom vale para este carrinho?" (só calcula)
--   reserve_coupon()     visitante: reserva o cupom ao enviar o pedido ao WhatsApp
--   confirm_coupon_redemption() / cancel_coupon_redemption()   admin: confirma ou cancela
--   admin_coupon_usage() admin: contagem de usos por cupom
--   cupom BEMVINDO10     10% no carrinho inteiro, 1 uso confirmado por WhatsApp
--
-- REGRAS COMERCIAIS (resumo; detalhes em docs/CUPONS.md)
--  1. Preço, promoção e desconto são SEMPRE calculados aqui, no banco, a partir de
--     products e promotions. O navegador só envia { id do produto, quantidade }.
--  2. Cupom x promoção: por padrão o cupom NÃO vale para itens que já estão em
--     promoção (applies_to_promo_items = false). Se ligado, o cupom incide sobre o
--     preço promocional (nunca sobre o preço "de"), então nunca há desconto duplo
--     sobre o mesmo valor.
--  3. Valor mínimo de compra = subtotal do carrinho INTEIRO (já com as promoções).
--  4. Arredondamento: tudo em centavos inteiros. Percentual: desconto =
--     floor((elegível × percentual + 0,5 centavo)), isto é, arredonda para o
--     centavo mais próximo (meio centavo sobe) UMA vez sobre o total elegível.
--     Valor fixo: min(valor, elegível). O desconto nunca passa do valor elegível.
--  5. Consumo: o cupom só conta como USADO quando o administrador confirma a compra.
--     Ao enviar o pedido ao WhatsApp o cupom fica RESERVADO por 48 h (ajuste em
--     coupon_reservation_window()). Reservas vencidas ou canceladas não contam.
--  6. Limite global: conta usos confirmados + reservas ativas; é verificado com o
--     cupom TRAVADO (select ... for update), então requisições simultâneas não
--     passam do limite.
--  7. Limite por cliente: o único identificador confiável é o WhatsApp que o
--     administrador informa ao CONFIRMAR a compra. O limite é aplicado nessa hora.
-- ============================================================

-- ---------- Funções auxiliares (puras) ----------
create or replace function public.normalize_coupon_code(p text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '\s+', '', 'g'))
$$;

-- Telefone brasileiro -> +55DDDNUMERO (ou null se inválido). Mesma regra do popup de cadastro.
create or replace function public.normalize_phone_br(p text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '55%' and length(d) in (12, 13) then return '+' || d; end if;
  if length(d) in (10, 11) then return '+55' || d; end if;
  return null;
end $$;

-- Por quanto tempo uma reserva (pedido enviado ao WhatsApp) segura o cupom
create or replace function public.coupon_reservation_window()
returns interval language sql immutable as $$ select interval '48 hours' $$;

-- ============================================================
-- Tabelas
-- ============================================================
create table if not exists public.coupons (
  id                     uuid primary key default gen_random_uuid(),
  code                   text not null,
  description            text not null default '',
  discount_type          text not null check (discount_type in ('percent', 'fixed')),
  discount_value         numeric(10,2) not null check (discount_value > 0),
  scope                  text not null default 'cart' check (scope in ('cart', 'product', 'category')),
  product_id             uuid references public.products (id)   on delete set null,
  category_id            uuid references public.categories (id) on delete set null,
  starts_at              timestamptz,
  ends_at                timestamptz,
  min_purchase           numeric(10,2) check (min_purchase is null or (min_purchase >= 0 and min_purchase < 100000)),
  max_uses               integer check (max_uses is null or max_uses > 0),
  per_customer_limit     integer check (per_customer_limit is null or per_customer_limit > 0),
  applies_to_promo_items boolean not null default false,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint coupons_code_format    check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  constraint coupons_percent_range  check (discount_type <> 'percent' or discount_value <= 100),
  constraint coupons_fixed_range    check (discount_type <> 'fixed' or discount_value < 100000),
  constraint coupons_dates          check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint coupons_scope_target   check (
       (scope = 'cart'     and product_id is null and category_id is null)
    or (scope = 'product'  and category_id is null)
    or (scope = 'category' and product_id is null))
);
-- Código único sem diferenciar maiúsculas (o trigger já grava em maiúsculas)
create unique index if not exists coupons_code_uidx on public.coupons (code);

create or replace function public.coupons_prepare()
returns trigger language plpgsql as $$
begin
  new.code := public.normalize_coupon_code(new.code);
  new.description := btrim(coalesce(new.description, ''));
  new.updated_at := now();

  -- O produto/categoria do cupom foi EXCLUÍDO (a chave estrangeira zerou o alvo):
  -- em vez de falhar a exclusão do produto, o cupom é desativado.
  if tg_op = 'UPDATE' then
    if (new.scope = 'product'  and new.product_id  is null and old.scope = 'product'  and old.product_id  is not null)
    or (new.scope = 'category' and new.category_id is null and old.scope = 'category' and old.category_id is not null) then
      new.is_active := false;
      return new;
    end if;
  end if;

  if new.scope = 'product'  and new.product_id  is null then raise exception 'Escolha o produto do cupom.'    using errcode = 'P0001'; end if;
  if new.scope = 'category' and new.category_id is null then raise exception 'Escolha a categoria do cupom.' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists coupons_prepare on public.coupons;
create trigger coupons_prepare before insert or update on public.coupons
  for each row execute function public.coupons_prepare();

-- Reservas e usos. O histórico é preservado mesmo se o cupom for excluído (coupon_id vira null).
create table if not exists public.coupon_redemptions (
  id             uuid primary key default gen_random_uuid(),
  order_ref      text not null unique,
  coupon_id      uuid references public.coupons (id) on delete set null,
  coupon_code    text not null,
  status         text not null default 'reserved' check (status in ('reserved', 'confirmed', 'cancelled')),
  client_id      uuid,
  cart_hash      text not null,
  cart           jsonb not null,
  subtotal_cents integer not null check (subtotal_cents >= 0),
  eligible_cents integer not null check (eligible_cents >= 0),
  discount_cents integer not null check (discount_cents >= 0),
  total_cents    integer not null check (total_cents >= 0),
  customer_phone text,
  note           text,
  reserved_at    timestamptz not null default now(),
  expires_at     timestamptz not null,
  confirmed_at   timestamptz,
  cancelled_at   timestamptz
);
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id, status);
create index if not exists coupon_redemptions_client_idx on public.coupon_redemptions (coupon_id, client_id) where status = 'reserved';
create index if not exists coupon_redemptions_phone_idx  on public.coupon_redemptions (coupon_id, customer_phone) where status = 'confirmed';

-- ============================================================
-- RLS — visitante NÃO lê nada destas tabelas; só o administrador
-- ============================================================
alter table public.coupons            enable row level security;
alter table public.coupon_redemptions enable row level security;

revoke all on public.coupons, public.coupon_redemptions from anon;

drop policy if exists "admin all coupons" on public.coupons;
create policy "admin all coupons" on public.coupons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Usos: o admin só LÊ por aqui; confirmar/cancelar passa pelas funções abaixo
drop policy if exists "admin read coupon_redemptions" on public.coupon_redemptions;
create policy "admin read coupon_redemptions" on public.coupon_redemptions
  for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.coupon_redemptions from authenticated;

-- ============================================================
-- Contagem de usos: confirmados + reservas ativas (não vencidas)
-- p_exclude_client: ignora as reservas do próprio cliente (serão reaproveitadas/substituídas)
-- ============================================================
create or replace function public._coupon_uses(p_coupon uuid, p_exclude_id uuid default null, p_exclude_client uuid default null)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.coupon_redemptions r
   where r.coupon_id = p_coupon
     and (p_exclude_id is null or r.id <> p_exclude_id)
     and (r.status = 'confirmed'
          or (r.status = 'reserved' and r.expires_at > now()
              and (p_exclude_client is null or r.client_id is distinct from p_exclude_client)))
$$;

-- ============================================================
-- Cálculo central (interno): valida o cupom e calcula o desconto.
-- p_items = [{ "id": <products.public_id>, "qty": n }, ...]
-- Nunca confia em preço vindo do navegador.
-- ============================================================
create or replace function public._coupon_evaluate(p_code text, p_items jsonb, p_lock boolean default false, p_client uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code   text := public.normalize_coupon_code(p_code);
  c        public.coupons;
  v_found  boolean;
  v_lines  jsonb;
  v_n      integer;
  v_sub    bigint;
  v_elig   bigint;
  v_promo  bigint;
  v_disc   bigint;
  v_finger text;
begin
  if v_code = '' or v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Código de cupom inválido.');
  end if;

  if p_lock then
    select * into c from public.coupons where code = v_code for update;
  else
    select * into c from public.coupons where code = v_code;
  end if;
  v_found := found;
  if not v_found then
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'Código de cupom inválido.');
  end if;

  if not c.is_active then
    return jsonb_build_object('ok', false, 'reason', 'inactive', 'message', 'Este cupom não está ativo.');
  end if;
  if c.starts_at is not null and c.starts_at > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_started', 'message', 'Este cupom ainda não está válido.');
  end if;
  if c.ends_at is not null and c.ends_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'expired', 'message', 'Este cupom expirou.');
  end if;
  if c.max_uses is not null and public._coupon_uses(c.id, null, p_client) >= c.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'exhausted', 'message', 'Este cupom esgotou.');
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    return jsonb_build_object('ok', false, 'reason', 'empty_cart', 'message', 'Adicione peças ao carrinho para usar o cupom.');
  end if;

  -- Linhas do carrinho com o preço ATUAL do banco (promoção incluída), mesma regra da vitrine
  with raw as (
    select e->>'id' as id_txt, e->>'qty' as qty_txt from jsonb_array_elements(p_items) e
  ), parsed as (
    select id_txt::integer as public_id, least(qty_txt::integer, 100) as qty
      from raw where id_txt ~ '^\d{1,9}$'
       and (case when qty_txt ~ '^\d{1,3}$' then qty_txt::integer else 0 end) >= 1
  ), merged as (
    select public_id, least(sum(qty), 100)::integer as qty from parsed group by public_id
  ), lines as (
    select p.public_id, p.name, p.id as product_id, p.category_id, m.qty,
           round(p.price * 100)::integer as base_cents,
           coalesce(round(pr.promo_price * 100)::integer, round(p.price * 100)::integer) as unit_cents,
           (pr.id is not null) as on_sale
      from merged m
      join public.products p on p.public_id = m.public_id and p.status = 'published' and p.in_stock
      left join public.promotions pr on pr.product_id = p.id and pr.is_active
           and (pr.starts_at is null or pr.starts_at <= now())
           and (pr.ends_at   is null or pr.ends_at   >= now())
           and pr.promo_price < p.price
  ), flagged as (
    select l.*,
           (c.scope = 'cart'
            or (c.scope = 'product'  and c.product_id  is not null and l.product_id  = c.product_id)
            or (c.scope = 'category' and c.category_id is not null and l.category_id = c.category_id)) as scope_ok
      from lines l
  )
  select count(*),
         coalesce(sum(unit_cents::bigint * qty), 0),
         coalesce(sum(unit_cents::bigint * qty) filter (where scope_ok and (not on_sale or c.applies_to_promo_items)), 0),
         coalesce(sum(unit_cents::bigint * qty) filter (where scope_ok and on_sale and not c.applies_to_promo_items), 0),
         coalesce(jsonb_agg(jsonb_build_object(
             'id', public_id, 'name', name, 'qty', qty, 'unit_cents', unit_cents, 'on_sale', on_sale,
             'eligible', (scope_ok and (not on_sale or c.applies_to_promo_items))) order by public_id), '[]'::jsonb),
         coalesce(string_agg(public_id || 'x' || qty, ',' order by public_id), '')
    into v_n, v_sub, v_elig, v_promo, v_lines, v_finger
    from flagged;

  if v_n = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty_cart', 'message', 'Adicione peças disponíveis ao carrinho para usar o cupom.');
  end if;

  if v_elig = 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible', 'subtotal_cents', v_sub,
      'message', case when v_promo > 0
        then 'Este cupom não vale para peças que já estão em promoção.'
        else 'Este cupom não se aplica às peças do carrinho.' end);
  end if;

  if c.min_purchase is not null and v_sub < round(c.min_purchase * 100) then
    return jsonb_build_object('ok', false, 'reason', 'min_purchase', 'subtotal_cents', v_sub,
      'min_purchase_cents', round(c.min_purchase * 100)::integer,
      'message', 'Este cupom exige compras a partir de ' || public.brl(c.min_purchase) || '.');
  end if;

  -- Desconto em centavos inteiros (ver regra 4 no topo do arquivo)
  if c.discount_type = 'percent' then
    v_disc := (v_elig * round(c.discount_value * 100)::bigint + 5000) / 10000;
  else
    v_disc := least(round(c.discount_value * 100)::bigint, v_elig);
  end if;
  v_disc := least(v_disc, v_elig);

  if v_disc <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible', 'subtotal_cents', v_sub,
      'message', 'O desconto deste cupom é zero para o carrinho atual.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', c.code,
    'description', c.description,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'scope', c.scope,
    'subtotal_cents', v_sub,
    'eligible_cents', v_elig,
    'discount_cents', v_disc,
    'total_cents', v_sub - v_disc,
    'promo_excluded_cents', v_promo,
    'lines', v_lines,
    'fingerprint', v_finger,
    'coupon_id', c.id);
end $$;

-- ============================================================
-- VISITANTE: validar (só calcula, não grava nada)
-- ============================================================
create or replace function public.validate_coupon(p_code text, p_items jsonb)
returns jsonb language sql stable security definer set search_path = public as $$
  select public._coupon_evaluate(p_code, p_items, false, null) - 'coupon_id' - 'fingerprint'
$$;

-- ============================================================
-- VISITANTE: reservar ao enviar o pedido ao WhatsApp
-- p_client_id: sorteio guardado no navegador; permite reaproveitar/substituir a
-- reserva do mesmo visitante em vez de acumular várias.
-- ============================================================
create or replace function public.reserve_coupon(p_code text, p_items jsonb, p_client_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  r        jsonb;
  v_hash   text;
  v_ref    text;
  v_exist  public.coupon_redemptions;
  v_row    public.coupon_redemptions;
  v_alpha  constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_try    integer := 0;
begin
  -- p_lock = true trava a linha do cupom até o fim da transação: reservas simultâneas
  -- do mesmo cupom passam uma de cada vez, então o limite global não é ultrapassado.
  r := public._coupon_evaluate(p_code, p_items, true, p_client_id);
  if not (r->>'ok')::boolean then
    return r - 'coupon_id' - 'fingerprint';
  end if;

  v_hash := md5((r->>'code') || '|' || (r->>'fingerprint') || '|' || (r->>'discount_cents'));

  if p_client_id is not null then
    -- mesma reserva ativa do mesmo visitante e mesmo carrinho: reaproveita
    select * into v_exist from public.coupon_redemptions
     where coupon_id = (r->>'coupon_id')::uuid and client_id = p_client_id and status = 'reserved'
       and expires_at > now() and cart_hash = v_hash
     order by reserved_at desc limit 1;
    if found then
      return (r - 'coupon_id' - 'fingerprint') || jsonb_build_object('order_ref', v_exist.order_ref, 'expires_at', v_exist.expires_at, 'reused', true);
    end if;

    -- carrinho mudou: a reserva anterior deste visitante é substituída
    update public.coupon_redemptions
       set status = 'cancelled', cancelled_at = now(), note = 'Substituída por nova reserva do mesmo visitante'
     where coupon_id = (r->>'coupon_id')::uuid and client_id = p_client_id and status = 'reserved';
  end if;

  loop
    v_ref := 'HL-' || (select string_agg(substr(v_alpha, 1 + floor(random() * length(v_alpha))::integer, 1), '') from generate_series(1, 6));
    begin
      insert into public.coupon_redemptions
        (order_ref, coupon_id, coupon_code, client_id, cart_hash, cart,
         subtotal_cents, eligible_cents, discount_cents, total_cents, expires_at)
      values
        (v_ref, (r->>'coupon_id')::uuid, r->>'code', p_client_id, v_hash, r->'lines',
         (r->>'subtotal_cents')::integer, (r->>'eligible_cents')::integer, (r->>'discount_cents')::integer,
         (r->>'total_cents')::integer, now() + public.coupon_reservation_window())
      returning * into v_row;
      exit;
    exception when unique_violation then
      v_try := v_try + 1;
      if v_try >= 8 then raise exception 'Não foi possível gerar o número do pedido. Tente de novo.'; end if;
    end;
  end loop;

  return (r - 'coupon_id' - 'fingerprint') || jsonb_build_object('order_ref', v_row.order_ref, 'expires_at', v_row.expires_at, 'reused', false);
end $$;

-- ============================================================
-- ADMIN: confirmar compra (consome o cupom de verdade)
-- ============================================================
create or replace function public.confirm_coupon_redemption(p_id uuid, p_customer_phone text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  rd    public.coupon_redemptions;
  c     public.coupons;
  v_ph  text := public.normalize_phone_br(p_customer_phone);
begin
  if not public.is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select * into rd from public.coupon_redemptions where id = p_id for update;
  if not found then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if rd.status = 'confirmed' then return jsonb_build_object('ok', true, 'already', true); end if;
  if rd.status = 'cancelled' then raise exception 'Esta reserva foi cancelada.' using errcode = 'P0001'; end if;

  if rd.coupon_id is not null then
    select * into c from public.coupons where id = rd.coupon_id for update;
    if found then
      if c.max_uses is not null and public._coupon_uses(c.id, rd.id, null) >= c.max_uses then
        raise exception 'O limite de utilizações deste cupom já foi atingido.' using errcode = 'P0001';
      end if;
      if c.per_customer_limit is not null then
        if v_ph is null then
          raise exception 'Informe o WhatsApp do cliente (com DDD) para conferir o limite por cliente.' using errcode = 'P0001';
        end if;
        if (select count(*) from public.coupon_redemptions x
             where x.coupon_id = c.id and x.status = 'confirmed' and x.customer_phone = v_ph and x.id <> rd.id) >= c.per_customer_limit then
          raise exception 'Este cliente já usou este cupom o máximo de vezes permitido.' using errcode = 'P0001';
        end if;
      end if;
    end if;
  end if;

  update public.coupon_redemptions
     set status = 'confirmed', confirmed_at = now(), customer_phone = coalesce(v_ph, customer_phone)
   where id = rd.id;
  return jsonb_build_object('ok', true);
end $$;

-- ADMIN: cancelar (libera a reserva ou devolve um uso já confirmado)
create or replace function public.cancel_coupon_redemption(p_id uuid, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare rd public.coupon_redemptions;
begin
  if not public.is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  select * into rd from public.coupon_redemptions where id = p_id for update;
  if not found then raise exception 'Reserva não encontrada.' using errcode = 'P0001'; end if;
  if rd.status = 'cancelled' then return jsonb_build_object('ok', true, 'already', true); end if;
  update public.coupon_redemptions
     set status = 'cancelled', cancelled_at = now(), note = coalesce(nullif(btrim(p_note), ''), note)
   where id = rd.id;
  return jsonb_build_object('ok', true);
end $$;

-- ADMIN: usos por cupom (confirmados e reservas ativas)
create or replace function public.admin_coupon_usage()
returns table (coupon_id uuid, confirmed integer, reserved integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  return query
    select r.coupon_id,
           (count(*) filter (where r.status = 'confirmed'))::integer,
           (count(*) filter (where r.status = 'reserved' and r.expires_at > now()))::integer
      from public.coupon_redemptions r
     where r.coupon_id is not null
     group by r.coupon_id;
end $$;

-- ============================================================
-- Permissões de execução (o Supabase concede EXECUTE a anon/authenticated por
-- padrão; aqui fechamos tudo e abrimos só o necessário)
-- ============================================================
revoke all on function public._coupon_uses(uuid, uuid, uuid)                 from public, anon, authenticated;
revoke all on function public._coupon_evaluate(text, jsonb, boolean, uuid)   from public, anon, authenticated;
revoke all on function public.validate_coupon(text, jsonb)                   from public, anon, authenticated;
revoke all on function public.reserve_coupon(text, jsonb, uuid)              from public, anon, authenticated;
revoke all on function public.confirm_coupon_redemption(uuid, text)          from public, anon, authenticated;
revoke all on function public.cancel_coupon_redemption(uuid, text)           from public, anon, authenticated;
revoke all on function public.admin_coupon_usage()                           from public, anon, authenticated;

grant execute on function public.validate_coupon(text, jsonb)                to anon, authenticated;
grant execute on function public.reserve_coupon(text, jsonb, uuid)           to anon, authenticated;
-- as três abaixo conferem is_admin() por dentro; o "authenticated" é só a porta de entrada
grant execute on function public.confirm_coupon_redemption(uuid, text)       to authenticated;
grant execute on function public.cancel_coupon_redemption(uuid, text)        to authenticated;
grant execute on function public.admin_coupon_usage()                        to authenticated;

-- ============================================================
-- Cupom de boas-vindas (o mesmo código mostrado no popup de cadastro).
-- "on conflict do nothing": rodar de novo não duplica nem sobrescreve ajustes
-- feitos depois no painel.
-- ============================================================
insert into public.coupons (code, description, discount_type, discount_value, scope, per_customer_limit, applies_to_promo_items, is_active)
values ('BEMVINDO10', 'Boas-vindas: 10% no carrinho (1 uso por WhatsApp, conferido na confirmação do pedido)', 'percent', 10, 'cart', 1, false, true)
on conflict (code) do nothing;
