-- ============================================================
-- HL STORE — cadastrar o PRIMEIRO (e único) administrador
-- ------------------------------------------------------------
-- Antes: crie o usuário no Supabase (Authentication > Users > Add user,
-- com e-mail e senha escolhidos POR VOCÊ; marque "Auto Confirm User").
-- Depois: troque o e-mail abaixo pelo MESMO e-mail e rode no SQL Editor.
-- Nenhuma senha passa por aqui.
-- ============================================================
insert into public.admin_users (user_id)
select id from auth.users where email = 'arthurfantasma02@gmail.com'
on conflict do nothing;

-- Conferir (deve mostrar 1 linha com o seu e-mail):
select u.email, a.created_at
from public.admin_users a join auth.users u on u.id = a.user_id;
