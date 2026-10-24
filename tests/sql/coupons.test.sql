-- ============================================================
-- Testes do sistema de cupons contra um PostgreSQL REAL.
-- Pré-requisito: tests/sql/00-supabase-stub.sql, db/schema.sql, db/coupons.sql
-- (ver tests/run-sql-tests.sh). Qualquer falha aborta com erro.
-- ============================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;
drop schema if exists t cascade;
create schema t;
grant usage on schema t to anon, authenticated;

-- ---------- helpers ----------
create function t.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALHOU: %', name; end if;
  raise notice 'ok - %', name;
end $$;

-- chama como visitante (anon) / usuário comum / admin
create function t.val(p_code text, p_items jsonb) returns jsonb language plpgsql as $$
declare r jsonb; begin
  set local role anon; r := public.validate_coupon(p_code, p_items); reset role; return r; end $$;
create function t.res(p_code text, p_items jsonb, p_client uuid default null) returns jsonb language plpgsql as $$
declare r jsonb; begin
  set local role anon; r := public.reserve_coupon(p_code, p_items, p_client); reset role; return r; end $$;

-- executa SQL e devolve a mensagem de erro (ou null se funcionou) no papel indicado
create function t.err(p_role text, p_sub uuid, p_sql text) returns text language plpgsql as $$
declare m text; begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  begin execute p_sql; exception when others then m := sqlerrm; end;
  reset role; perform set_config('request.jwt.claim.sub', '', true);
  return m; end $$;
create function t.rows(p_role text, p_sub uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint; begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  execute 'select count(*) from (' || p_sql || ') q' into n;
  reset role; perform set_config('request.jwt.claim.sub', '', true);
  return n; end $$;
create function t.affected(p_role text, p_sub uuid, p_sql text) returns bigint language plpgsql as $$
declare n bigint; begin
  execute format('set local role %I', p_role);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  execute p_sql; get diagnostics n = row_count;
  reset role; perform set_config('request.jwt.claim.sub', '', true);
  return n; end $$;
create function t.as_admin(p_sub uuid, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb; begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  execute p_sql into r;
  reset role; perform set_config('request.jwt.claim.sub', '', true);
  return r; end $$;

-- ---------- dados de teste ----------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@teste'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'cliente@teste');
insert into public.admin_users (user_id) values ('aaaaaaaa-0000-0000-0000-000000000001') on conflict do nothing;

insert into public.categories (id, slug, name) values
  ('c0000000-0000-0000-0000-00000000000a', 'cat-a', 'Cat A'),
  ('c0000000-0000-0000-0000-00000000000b', 'cat-b', 'Cat B');

insert into public.products (public_id, name, price, sizes, in_stock, status, category_id) values
  (901, 'Camisa A',   100.00, '{M}', true,  'published', 'c0000000-0000-0000-0000-00000000000a'),
  (902, 'Polo B',      50.00, '{M}', true,  'published', 'c0000000-0000-0000-0000-00000000000b'),
  (903, 'Odd 33,33',   33.33, '{M}', true,  'published', 'c0000000-0000-0000-0000-00000000000a'),
  (904, 'Cents 10,05', 10.05, '{M}', true,  'published', 'c0000000-0000-0000-0000-00000000000b'),
  (905, 'Em promo',   200.00, '{M}', true,  'published', 'c0000000-0000-0000-0000-00000000000a'),
  (906, 'Sem estoque', 80.00, '{M}', false, 'published', null),
  (907, 'Rascunho',    80.00, '{M}', true,  'draft',     null);
insert into public.promotions (product_id, promo_price)
  select id, 150.00 from public.products where public_id = 905;

-- cupons de teste (superusuário ignora RLS)
insert into public.coupons (code, discount_type, discount_value) values
  ('PCT10', 'percent', 10), ('FIX15', 'fixed', 15), ('FIX999', 'fixed', 999);
insert into public.coupons (code, discount_type, discount_value, is_active) values ('OFF20', 'percent', 20, false);
insert into public.coupons (code, discount_type, discount_value, ends_at) values ('OLD10', 'percent', 10, now() - interval '1 day');
insert into public.coupons (code, discount_type, discount_value, starts_at) values ('SOON10', 'percent', 10, now() + interval '1 day');
insert into public.coupons (code, discount_type, discount_value, min_purchase) values ('MIN200', 'percent', 10, 200);
insert into public.coupons (code, discount_type, discount_value, scope, product_id)
  select 'PROD902', 'percent', 50, 'product', id from public.products where public_id = 902;
insert into public.coupons (code, discount_type, discount_value, scope, category_id)
  values ('CATA', 'percent', 10, 'category', 'c0000000-0000-0000-0000-00000000000a');
insert into public.coupons (code, discount_type, discount_value, applies_to_promo_items) values ('PROMOOK', 'percent', 10, true);

-- ============================================================
-- 1. Migração idempotente e cupom de boas-vindas
-- ============================================================
select t.ok((select count(*) from public.coupons where code = 'BEMVINDO10') = 1, 'BEMVINDO10 existe uma vez');
select t.ok((select discount_type = 'percent' and discount_value = 10 and scope = 'cart' from public.coupons where code = 'BEMVINDO10'), 'BEMVINDO10 = 10% no carrinho');
update public.coupons set discount_value = 12 where code = 'BEMVINDO10';  -- ajuste do admin
\i db/coupons.sql
select t.ok((select count(*) from public.coupons where code = 'BEMVINDO10') = 1, 'rodar a migração de novo não duplica o cupom');
select t.ok((select discount_value = 12 from public.coupons where code = 'BEMVINDO10'), 'rodar a migração de novo não sobrescreve ajuste do admin');
update public.coupons set discount_value = 10 where code = 'BEMVINDO10';

-- ============================================================
-- 2. Validações do banco (valores/códigos/datas inválidos)
-- ============================================================
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value) values ('BAD1','percent',101)$$) is not null, 'rejeita percentual > 100');
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value) values ('BAD2','percent',0)$$) is not null, 'rejeita desconto zero');
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value) values ('BAD3','fixed',-5)$$) is not null, 'rejeita desconto negativo');
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value) values ('bemvindo10','percent',5)$$) is not null, 'rejeita código duplicado (ignorando maiúsculas)');
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value) values (' pct10 ','percent',5)$$) is not null, 'rejeita código duplicado (ignorando espaços)');
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value) values ('A B','percent',5)$$) is not null, 'rejeita código com espaço no meio');
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value) values ('X','percent',5)$$) is not null, 'rejeita código curto demais');
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value,starts_at,ends_at) values ('DT1','percent',5, now(), now() - interval '1 day')$$) is not null, 'rejeita término antes do início');
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value,scope) values ('SC1','percent',5,'product')$$) is not null, 'escopo produto exige produto');
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value,scope) values ('SC2','percent',5,'category')$$) is not null, 'escopo categoria exige categoria');
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value,max_uses) values ('MX1','percent',5,0)$$) is not null, 'rejeita limite de usos zero');
select t.ok(t.err('postgres', null, $$insert into public.coupons(code,discount_type,discount_value,min_purchase) values ('MN1','percent',5,-1)$$) is not null, 'rejeita valor mínimo negativo');
insert into public.coupons (code, discount_type, discount_value) values ('  lower5 ', 'percent', 5) on conflict do nothing;
select t.ok(exists (select 1 from public.coupons where code = 'LOWER5'), 'código é normalizado (maiúsculas, sem espaços nas pontas)');

-- ============================================================
-- 3. Cálculo: percentual, fixo, arredondamento
-- ============================================================
select t.ok((t.val('PCT10', '[{"id":901,"qty":2}]')->>'discount_cents')::int = 2000, 'percentual: 10% de R$ 200,00 = R$ 20,00');
select t.ok((t.val('pct10', '[{"id":901,"qty":2}]')->>'ok')::boolean, 'código em minúsculas é aceito');
select t.ok((t.val(' PCT10 ', '[{"id":901,"qty":2}]')->>'ok')::boolean, 'código com espaços nas pontas é aceito');
select t.ok((t.val('PCT10', '[{"id":901,"qty":2}]')->>'total_cents')::int = 18000, 'total = subtotal - desconto');
select t.ok((t.val('FIX15', '[{"id":901,"qty":1}]')->>'discount_cents')::int = 1500, 'fixo: R$ 15,00');
select t.ok((t.val('FIX999', '[{"id":902,"qty":1}]')->>'discount_cents')::int = 5000, 'fixo nunca passa do valor elegível (R$ 50,00)');
select t.ok((t.val('FIX999', '[{"id":902,"qty":1}]')->>'total_cents')::int = 0, 'fixo grande: total zera, nunca fica negativo');
select t.ok((t.val('PCT10', '[{"id":903,"qty":1}]')->>'discount_cents')::int = 333, 'arredondamento: 10% de 33,33 = 3,333 -> 3,33');
select t.ok((t.val('PCT10', '[{"id":904,"qty":1}]')->>'discount_cents')::int = 101, 'arredondamento: 10% de 10,05 = 1,005 -> 1,01 (meio centavo sobe)');
select t.ok((t.val('PCT10', '[{"id":903,"qty":3}]')->>'discount_cents')::int = 1000, 'arredondamento único sobre o total (3 x 33,33 = 99,99 -> 10,00)');
select t.ok((t.val('PCT10', '[{"id":901,"qty":1},{"id":901,"qty":1}]')->>'subtotal_cents')::int = 20000, 'linhas repetidas do mesmo produto são somadas');

-- ============================================================
-- 4. Rejeições: inativo, expirado, agendado, inexistente, carrinho
-- ============================================================
select t.ok(t.val('OFF20', '[{"id":901,"qty":1}]')->>'reason' = 'inactive', 'rejeita cupom inativo');
select t.ok(t.val('OLD10', '[{"id":901,"qty":1}]')->>'reason' = 'expired', 'rejeita cupom expirado');
select t.ok(t.val('SOON10', '[{"id":901,"qty":1}]')->>'reason' = 'not_started', 'rejeita cupom que ainda não começou');
select t.ok(t.val('NAOEXISTE', '[{"id":901,"qty":1}]')->>'reason' = 'not_found', 'rejeita código inexistente');
select t.ok(t.val('', '[{"id":901,"qty":1}]')->>'reason' = 'not_found', 'rejeita código vazio');
select t.ok(t.val('PCT10', '[]')->>'reason' = 'empty_cart', 'carrinho vazio');
select t.ok(t.val('PCT10', '[{"id":906,"qty":1}]')->>'reason' = 'empty_cart', 'produto sem estoque não conta');
select t.ok(t.val('PCT10', '[{"id":907,"qty":1}]')->>'reason' = 'empty_cart', 'produto em rascunho não conta');
select t.ok(t.val('PCT10', '[{"id":99999,"qty":1}]')->>'reason' = 'empty_cart', 'produto inexistente não conta');

-- entradas malformadas nunca derrubam a função
select t.ok(t.val('PCT10', 'null')->>'ok' = 'false', 'items = null JSON');
select t.ok(t.val('PCT10', '"abc"')->>'ok' = 'false', 'items = texto');
select t.ok(t.val('PCT10', '[{"id":"x","qty":"y"},{"id":901},{"qty":2},5,null]')->>'ok' = 'false', 'itens lixo são ignorados');
select t.ok(t.val('PCT10', '[{"id":901,"qty":-5}]')->>'ok' = 'false', 'quantidade negativa ignorada');
select t.ok((t.val('PCT10', '[{"id":901,"qty":999}]')->>'subtotal_cents')::int = 100 * 10000, 'quantidade grande é limitada a 100 por produto');
select t.ok(t.val('PCT10', '[{"id":901,"qty":999999999}]')->>'reason' = 'empty_cart', 'quantidade com mais de 3 dígitos é ignorada (sem estourar inteiro)');
select t.ok(t.val('PCT10', (select jsonb_agg(jsonb_build_object('id', g, 'qty', 1)) from generate_series(1, 60) g))->>'ok' = 'false', 'mais de 50 linhas é recusado');
select t.ok(t.val('PCT10', '[{"id":901,"qty":1,"price":0.01,"unit_cents":1}]')->>'subtotal_cents' = '10000', 'preço enviado pelo navegador é ignorado');

-- ============================================================
-- 5. Escopo: produto, categoria, não elegível
-- ============================================================
select t.ok(t.val('PROD902', '[{"id":901,"qty":1}]')->>'reason' = 'not_eligible', 'cupom de produto não vale para outro produto');
select t.ok((t.val('PROD902', '[{"id":901,"qty":1},{"id":902,"qty":2}]')->>'discount_cents')::int = 5000, 'cupom de produto: 50% só sobre o produto 902 (2 x 50,00)');
select t.ok((t.val('PROD902', '[{"id":901,"qty":1},{"id":902,"qty":2}]')->>'eligible_cents')::int = 10000, 'elegível = só o produto do cupom');
select t.ok(t.val('CATA', '[{"id":902,"qty":1}]')->>'reason' = 'not_eligible', 'cupom de categoria não vale para outra categoria');
select t.ok((t.val('CATA', '[{"id":901,"qty":1},{"id":902,"qty":1}]')->>'discount_cents')::int = 1000, 'cupom de categoria: 10% só sobre a categoria A');

-- ============================================================
-- 6. Valor mínimo
-- ============================================================
select t.ok(t.val('MIN200', '[{"id":901,"qty":1}]')->>'reason' = 'min_purchase', 'abaixo do valor mínimo');
select t.ok(t.val('MIN200', '[{"id":901,"qty":1}]')->>'message' like '%R$ 200,00%', 'mensagem do mínimo traz o valor');
select t.ok((t.val('MIN200', '[{"id":901,"qty":2}]')->>'ok')::boolean, 'no valor mínimo exato é aceito');
select t.ok(t.val('MIN200', '[{"id":901,"qty":1},{"id":902,"qty":2}]')->>'ok' = 'true', 'mínimo conta o carrinho todo');

-- ============================================================
-- 7. Promoções existentes
-- ============================================================
select t.ok((t.val('PCT10', '[{"id":905,"qty":1}]')->>'reason') = 'not_eligible', 'cupom padrão não vale para item em promoção');
select t.ok(t.val('PCT10', '[{"id":905,"qty":1}]')->>'message' like '%promoção%', 'mensagem explica a promoção');
select t.ok((t.val('PCT10', '[{"id":905,"qty":1},{"id":901,"qty":1}]')->>'subtotal_cents')::int = 25000, 'subtotal usa o preço promocional (150 + 100)');
select t.ok((t.val('PCT10', '[{"id":905,"qty":1},{"id":901,"qty":1}]')->>'eligible_cents')::int = 10000, 'só o item sem promoção é elegível');
select t.ok((t.val('PCT10', '[{"id":905,"qty":1},{"id":901,"qty":1}]')->>'discount_cents')::int = 1000, 'desconto só sobre item sem promoção');
select t.ok((t.val('PROMOOK', '[{"id":905,"qty":1}]')->>'discount_cents')::int = 1500, 'applies_to_promo_items: 10% sobre o preço PROMOCIONAL (nunca sobre o "de")');
select t.ok((t.val('PROMOOK', '[{"id":905,"qty":1}]')->>'total_cents')::int = 13500, 'total = 150 - 15 (sem desconto duplo)');
update public.promotions set is_active = false where product_id = (select id from public.products where public_id = 905);
select t.ok((t.val('PCT10', '[{"id":905,"qty":1}]')->>'discount_cents')::int = 2000, 'promoção desativada: item volta a ser elegível pelo preço normal');
update public.promotions set is_active = true, ends_at = now() - interval '1 hour' where product_id = (select id from public.products where public_id = 905);
select t.ok((t.val('PCT10', '[{"id":905,"qty":1}]')->>'subtotal_cents')::int = 20000, 'promoção vencida não reduz o preço');
update public.promotions set ends_at = null where product_id = (select id from public.products where public_id = 905);

-- ============================================================
-- 8. Segurança (RLS e permissões)
-- ============================================================
select t.ok(t.err('anon', null, 'select * from public.coupons') is not null, 'visitante NÃO lê a tabela de cupons');
select t.ok(t.err('anon', null, $$insert into public.coupons(code,discount_type,discount_value) values ('HACK','percent',99)$$) is not null, 'visitante não cria cupom');
select t.ok(t.err('anon', null, 'select * from public.coupon_redemptions') is not null, 'visitante NÃO lê reservas');
select t.ok(t.rows('authenticated', 'bbbbbbbb-0000-0000-0000-000000000002', 'select * from public.coupons') = 0, 'usuário logado comum (cliente) não enxerga cupons');
select t.ok(t.err('authenticated', 'bbbbbbbb-0000-0000-0000-000000000002', $$insert into public.coupons(code,discount_type,discount_value) values ('HACK2','percent',99)$$) is not null, 'cliente logado não cria cupom');
select t.ok(t.affected('authenticated', 'bbbbbbbb-0000-0000-0000-000000000002', $$update public.coupons set discount_value = 99 where code = 'PCT10'$$) = 0, 'cliente logado não edita cupom (0 linhas)');
select t.ok(t.affected('authenticated', 'bbbbbbbb-0000-0000-0000-000000000002', $$delete from public.coupons where code = 'PCT10'$$) = 0, 'cliente logado não exclui cupom (0 linhas)');
select t.ok((select discount_value from public.coupons where code = 'PCT10') = 10, 'cupom PCT10 continua intacto');
select t.ok(t.err('anon', null, $$select public._coupon_evaluate('PCT10','[]')$$) is not null, 'visitante não chama a função interna');
select t.ok(t.err('anon', null, $$select public.admin_coupon_usage()$$) is not null, 'visitante não chama admin_coupon_usage');
select t.ok(t.err('authenticated', 'bbbbbbbb-0000-0000-0000-000000000002', $$select public.admin_coupon_usage()$$) like '%permiss%', 'cliente logado não vê uso dos cupons');
select t.ok(t.rows('authenticated', 'aaaaaaaa-0000-0000-0000-000000000001', 'select * from public.coupons') > 5, 'admin lê cupons');
select t.ok(t.err('authenticated', 'aaaaaaaa-0000-0000-0000-000000000001', $$insert into public.coupons(code,discount_type,discount_value) values ('ADM10','percent',10)$$) is null, 'admin cria cupom');
select t.ok(t.err('authenticated', 'aaaaaaaa-0000-0000-0000-000000000001', $$update public.coupons set is_active = false where code = 'ADM10'$$) is null, 'admin desativa cupom');
select t.ok((select not is_active from public.coupons where code = 'ADM10'), 'desativação gravada');
select t.ok(t.val('ADM10', '[{"id":901,"qty":1}]')->>'reason' = 'inactive', 'cupom desativado é recusado na validação');
select t.ok(t.err('authenticated', 'aaaaaaaa-0000-0000-0000-000000000001', $$update public.coupons set is_active = true, discount_value = 15 where code = 'ADM10'$$) is null, 'admin reativa e edita');
select t.ok((t.val('ADM10', '[{"id":901,"qty":1}]')->>'discount_cents')::int = 1500, 'edição vale na validação (15%)');
select t.ok(t.err('authenticated', 'aaaaaaaa-0000-0000-0000-000000000001', $$delete from public.coupons where code = 'ADM10'$$) is null, 'admin exclui cupom');
select t.ok(not exists (select 1 from public.coupons where code = 'ADM10'), 'exclusão gravada');
select t.ok(t.err('authenticated', 'aaaaaaaa-0000-0000-0000-000000000001', $$insert into public.coupons(code,discount_type,discount_value) values ('PCT10','percent',1)$$) is not null, 'admin também não duplica código');

-- ============================================================
-- 9. Reserva, limite global, consumo
-- ============================================================
insert into public.coupons (code, discount_type, discount_value, max_uses) values ('MAX2', 'percent', 10, 2);
select t.ok((t.res('MAX2', '[{"id":901,"qty":1}]', gen_random_uuid())->>'order_ref') like 'HL-%', 'reserva devolve número do pedido HL-XXXXXX');
select t.ok((select count(*) from public.coupon_redemptions where coupon_code = 'MAX2' and status = 'reserved') = 1, 'reserva gravada como reservada (não como usada)');
select t.ok(t.val('MAX2', '[{"id":901,"qty":1}]')->>'ok' = 'true', 'validar não consome nada');
select t.ok((select count(*) from public.coupon_redemptions where coupon_code = 'MAX2') = 1, 'validar não grava reserva');
select t.ok((t.res('MAX2', '[{"id":901,"qty":1}]', gen_random_uuid())->>'ok')::boolean, 'segunda reserva (outro visitante)');
select t.ok(t.res('MAX2', '[{"id":901,"qty":1}]', gen_random_uuid())->>'reason' = 'exhausted', 'terceira reserva: esgotado (limite 2)');
select t.ok(t.val('MAX2', '[{"id":901,"qty":1}]')->>'reason' = 'exhausted', 'validação também mostra esgotado');
-- cancelar libera
select t.as_admin('aaaaaaaa-0000-0000-0000-000000000001', format($$select public.cancel_coupon_redemption(%L)$$, (select id from public.coupon_redemptions where coupon_code = 'MAX2' order by reserved_at limit 1)));
select t.ok(t.val('MAX2', '[{"id":901,"qty":1}]')->>'ok' = 'true', 'cancelar uma reserva libera a vaga');
-- reserva vencida não conta
select t.res('MAX2', '[{"id":901,"qty":1}]', gen_random_uuid());
select t.ok(t.val('MAX2', '[{"id":901,"qty":1}]')->>'reason' = 'exhausted', 'de novo esgotado');
update public.coupon_redemptions set expires_at = now() - interval '1 minute' where coupon_code = 'MAX2' and status = 'reserved';
select t.ok(t.val('MAX2', '[{"id":901,"qty":1}]')->>'ok' = 'true', 'reservas vencidas deixam de contar');
-- confirmar consome de forma definitiva
select t.res('MAX2', '[{"id":901,"qty":1}]', 'dddddddd-0000-0000-0000-000000000001');
select t.res('MAX2', '[{"id":902,"qty":1}]', 'dddddddd-0000-0000-0000-000000000002');
select t.ok(t.val('MAX2', '[{"id":901,"qty":1}]')->>'reason' = 'exhausted', 'duas reservas ativas esgotam');
select t.ok(t.err('authenticated', 'bbbbbbbb-0000-0000-0000-000000000002', format($$select public.confirm_coupon_redemption(%L)$$, (select id from public.coupon_redemptions where client_id = 'dddddddd-0000-0000-0000-000000000001'))) like '%permiss%', 'cliente comum NÃO confirma compra');
select t.ok(t.err('anon', null, format($$select public.confirm_coupon_redemption(%L)$$, (select id from public.coupon_redemptions where client_id = 'dddddddd-0000-0000-0000-000000000001'))) is not null, 'visitante NÃO confirma compra');
select t.ok(t.err('authenticated', 'bbbbbbbb-0000-0000-0000-000000000002', format($$select public.cancel_coupon_redemption(%L)$$, (select id from public.coupon_redemptions where client_id = 'dddddddd-0000-0000-0000-000000000001'))) like '%permiss%', 'cliente comum NÃO cancela');
select t.as_admin('aaaaaaaa-0000-0000-0000-000000000001', format($$select public.confirm_coupon_redemption(%L)$$, (select id from public.coupon_redemptions where client_id = 'dddddddd-0000-0000-0000-000000000001')));
select t.ok((select status from public.coupon_redemptions where client_id = 'dddddddd-0000-0000-0000-000000000001') = 'confirmed', 'admin confirma: status confirmed');
update public.coupon_redemptions set expires_at = now() - interval '1 day' where client_id = 'dddddddd-0000-0000-0000-000000000001';
select t.ok(t.val('MAX2', '[{"id":901,"qty":1}]')->>'reason' = 'exhausted', 'uso confirmado não vence');

-- reaproveitar / substituir reserva do mesmo visitante
insert into public.coupons (code, discount_type, discount_value, max_uses) values ('MAX1', 'percent', 10, 1);
select t.ok((t.res('MAX1', '[{"id":901,"qty":1}]', 'eeeeeeee-0000-0000-0000-000000000001')->>'ok')::boolean, 'MAX1: primeira reserva');
select t.ok((t.res('MAX1', '[{"id":901,"qty":1}]', 'eeeeeeee-0000-0000-0000-000000000001')->>'reused')::boolean, 'mesmo visitante e carrinho: reaproveita (não esgota por clicar duas vezes)');
select t.ok((select count(*) from public.coupon_redemptions where coupon_code = 'MAX1') = 1, 'sem reserva duplicada');
select t.ok((t.res('MAX1', '[{"id":901,"qty":2}]', 'eeeeeeee-0000-0000-0000-000000000001')->>'ok')::boolean, 'carrinho mudou: substitui a reserva anterior do mesmo visitante');
select t.ok((select count(*) from public.coupon_redemptions where coupon_code = 'MAX1' and status = 'reserved') = 1, 'apenas 1 reserva ativa depois de substituir');
select t.ok(t.res('MAX1', '[{"id":901,"qty":1}]', gen_random_uuid())->>'reason' = 'exhausted', 'outro visitante não passa do limite');
select t.ok((select discount_cents from public.coupon_redemptions where coupon_code = 'MAX1' and status = 'reserved') = 2000, 'reserva guarda o desconto calculado pelo banco');

-- ============================================================
-- 10. Limite por cliente (conferido na confirmação, por WhatsApp)
-- ============================================================
select t.res('BEMVINDO10', '[{"id":901,"qty":1}]', 'ffffffff-0000-0000-0000-000000000001');
select t.res('BEMVINDO10', '[{"id":902,"qty":1}]', 'ffffffff-0000-0000-0000-000000000002');
select t.ok(t.err('authenticated', 'aaaaaaaa-0000-0000-0000-000000000001', format($$select public.confirm_coupon_redemption(%L)$$, (select id from public.coupon_redemptions where client_id = 'ffffffff-0000-0000-0000-000000000001'))) like '%WhatsApp%', 'cupom com limite por cliente exige o WhatsApp para confirmar');
select t.as_admin('aaaaaaaa-0000-0000-0000-000000000001', format($$select public.confirm_coupon_redemption(%L, '(15) 99825-0486')$$, (select id from public.coupon_redemptions where client_id = 'ffffffff-0000-0000-0000-000000000001')));
select t.ok((select customer_phone from public.coupon_redemptions where client_id = 'ffffffff-0000-0000-0000-000000000001') = '+5515998250486', 'WhatsApp normalizado (+55...)');
select t.ok(t.err('authenticated', 'aaaaaaaa-0000-0000-0000-000000000001', format($$select public.confirm_coupon_redemption(%L, '15998250486')$$, (select id from public.coupon_redemptions where client_id = 'ffffffff-0000-0000-0000-000000000002'))) like '%já usou%', 'mesmo WhatsApp não confirma o cupom 2x (mesmo digitado diferente)');
select t.ok((select status from public.coupon_redemptions where client_id = 'ffffffff-0000-0000-0000-000000000002') = 'reserved', 'recusa não altera a reserva');
select t.as_admin('aaaaaaaa-0000-0000-0000-000000000001', format($$select public.confirm_coupon_redemption(%L, '(11) 91234-5678')$$, (select id from public.coupon_redemptions where client_id = 'ffffffff-0000-0000-0000-000000000002')));
select t.ok((select status from public.coupon_redemptions where client_id = 'ffffffff-0000-0000-0000-000000000002') = 'confirmed', 'outro WhatsApp confirma normalmente');
-- cancelar uma confirmada devolve o uso
select t.as_admin('aaaaaaaa-0000-0000-0000-000000000001', format($$select public.cancel_coupon_redemption(%L, 'cliente desistiu')$$, (select id from public.coupon_redemptions where client_id = 'ffffffff-0000-0000-0000-000000000001')));
select t.ok((select status from public.coupon_redemptions where client_id = 'ffffffff-0000-0000-0000-000000000001') = 'cancelled', 'compra confirmada pode ser cancelada');
select t.ok(t.err('authenticated', 'aaaaaaaa-0000-0000-0000-000000000001', format($$select public.confirm_coupon_redemption(%L, '15998250486')$$, (select id from public.coupon_redemptions where client_id = 'ffffffff-0000-0000-0000-000000000001'))) like '%cancelada%', 'reserva cancelada não pode ser confirmada');
select t.ok((t.as_admin('aaaaaaaa-0000-0000-0000-000000000001', $$select jsonb_agg(to_jsonb(u)) from public.admin_coupon_usage() u$$)) is not null, 'admin_coupon_usage devolve contagens ao admin');

-- ============================================================
-- 11. Exclusão de produto/categoria ligados a cupom
-- ============================================================
insert into public.products (public_id, name, price, sizes, status) values (950, 'Efêmero', 40.00, '{M}', 'published');
insert into public.coupons (code, discount_type, discount_value, scope, product_id)
  select 'EFEMERO', 'percent', 10, 'product', id from public.products where public_id = 950;
delete from public.products where public_id = 950;
select t.ok((select not is_active and product_id is null from public.coupons where code = 'EFEMERO'), 'excluir o produto desativa o cupom dele (não falha nem apaga)');
delete from public.categories where slug = 'cat-a';
select t.ok((select not is_active from public.coupons where code = 'CATA'), 'excluir a categoria desativa o cupom dela');

-- histórico preservado ao excluir cupom
select t.ok((select count(*) from public.coupon_redemptions where coupon_code = 'MAX1') = 2, 'MAX1 tem histórico (substituída + ativa)');
delete from public.coupons where code = 'MAX1';
select t.ok((select count(*) from public.coupon_redemptions where coupon_code = 'MAX1' and coupon_id is null) = 2, 'excluir cupom preserva o histórico de usos');

\echo '=== TODOS OS TESTES SQL (sequenciais) PASSARAM ==='
