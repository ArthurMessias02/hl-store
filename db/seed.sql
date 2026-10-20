-- HL STORE — migração dos produtos atuais (js/products.js) para o banco.
-- Rode DEPOIS de schema.sql. Os produtos entram como PUBLISHED. Imagens mantêm o
-- caminho local (assets/images/...) até serem enviadas ao Storage pelo painel.
-- Não inclui promoções: as de js/promotions.js são apenas demonstrativas.

insert into public.products (public_id, name, description, price, sizes, in_stock, featured, status, sort_order)
values (1, 'Camiseta Tommy Hilfiger', 'Camiseta Tommy Hilfiger com design moderno e acabamento impecável, perfeita para compor looks casuais e deixar o visual ainda mais elegante.', 89.99, array['P', 'M', 'G', 'GG'], true, true, 'published', 0)
on conflict (public_id) do nothing;
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-01.webp', 'Camiseta Tommy Hilfiger', 0 from public.products where public_id = 1
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-01.webp');
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-01-02.webp', 'Camiseta Tommy Hilfiger', 1 from public.products where public_id = 1
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-01-02.webp');
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-01-03.webp', 'Camiseta Tommy Hilfiger', 2 from public.products where public_id = 1
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-01-03.webp');

insert into public.products (public_id, name, description, price, sizes, in_stock, featured, status, sort_order)
values (2, 'Camiseta Polo Zara', 'Elegância e versatilidade em uma única peça. Um modelo atemporal, perfeito para compor produções sofisticadas tanto no dia a dia quanto em ocasiões especiais.', 105.99, array['P', 'M', 'G', 'GG'], true, false, 'published', 1)
on conflict (public_id) do nothing;
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-02.webp', 'Camiseta Polo Zara', 0 from public.products where public_id = 2
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-02.webp');
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-02-02.webp', 'Camiseta Polo Zara', 1 from public.products where public_id = 2
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-02-02.webp');
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-02-03.webp', 'Camiseta Polo Zara', 2 from public.products where public_id = 2
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-02-03.webp');
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-02-04.webp', 'Camiseta Polo Zara', 3 from public.products where public_id = 2
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-02-04.webp');

insert into public.products (public_id, name, description, price, sizes, in_stock, featured, status, sort_order)
values (3, 'Camiseta Zara Basica', 'Camiseta Zara Basica com design minimalista e elegante, perfeita para quem busca conforto e estilo em uma única peça.', 85.99, array['M', 'G'], true, true, 'published', 2)
on conflict (public_id) do nothing;
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-03.webp', 'Camiseta Zara Basica', 0 from public.products where public_id = 3
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-03.webp');
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-03-02.webp', 'Camiseta Zara Basica', 1 from public.products where public_id = 3
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-03-02.webp');

insert into public.products (public_id, name, description, price, sizes, in_stock, featured, status, sort_order)
values (5, 'Camisa Boss e Diesel', 'Tecido leve com toque de seda, corte slim e elegância para qualquer ocasião.', 79.99, array['P', 'M', 'G', 'GG'], true, true, 'published', 3)
on conflict (public_id) do nothing;
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-04.webp', 'Camisa Boss e Diesel', 0 from public.products where public_id = 5
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-04.webp');
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-04-02.webp', 'Camisa Boss e Diesel', 1 from public.products where public_id = 5
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-04-02.webp');
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-04-03.webp', 'Camisa Boss e Diesel', 2 from public.products where public_id = 5
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-04-03.webp');
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-04-04.webp', 'Camisa Boss e Diesel', 3 from public.products where public_id = 5
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-04-04.webp');
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-04-05.webp', 'Camisa Boss e Diesel', 4 from public.products where public_id = 5
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-04-05.webp');

insert into public.products (public_id, name, description, price, sizes, in_stock, featured, status, sort_order)
values (4, 'Bermuda Diesel', 'Tecido resistente, corte moderno e detalhes sutis para um look casual sofisticado.', 89.99, array['M', 'G', 'GG'], true, true, 'published', 4)
on conflict (public_id) do nothing;
insert into public.product_images (product_id, path, alt, sort_order)
select id, 'assets/images/produto-05.webp', 'Bermuda Diesel', 0 from public.products where public_id = 4
and not exists (select 1 from public.product_images i where i.product_id = products.id and i.path = 'assets/images/produto-05.webp');

-- Faz a numeração automática continuar depois do maior número usado acima
select setval(pg_get_serial_sequence('public.products', 'public_id'),
              greatest((select max(public_id) from public.products), 1));
