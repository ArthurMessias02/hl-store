# HL Store — arquitetura preparada para o painel administrativo

> Estado: **implementado** (painel, login, produtos, promoções, fotos e vitrine ligada ao banco).
> Para ativar, siga **docs/GUIA-CONFIGURACAO.md**. Este arquivo explica as decisões de arquitetura
> (escrito na fase de preparação; as seções 3 a 6 foram superadas pela implementação — vale o guia).

## 1. Situação encontrada no projeto
- Site estático: HTML + CSS + JS puro, **sem build, sem dependências, sem Node**. Hospedagem estática no Vercel.
- Produtos em `js/products.js` (`window.HL_PRODUCTS`), fotos em `assets/images/`.
- Carrinho em `js/cart.js`/`cart-ui.js`: guarda só id + tamanho + quantidade no `localStorage` (`hl-store-cart`) e lê o preço de `HL_PRODUCTS`. É o carrinho **de cada visitante**; continua no navegador (correto, não precisa de banco).
- Configuração em `js/config.js` (WhatsApp, Instagram, textos do pedido).
- **Limitação real:** como não há servidor, o navegador não pode guardar segredos. Toda proteção de escrita precisa estar no banco (RLS), não no JavaScript.
- **Pontos a adaptar para gestão futura:** `main.js` e `cart.js` leem `HL_PRODUCTS` de forma síncrona; textos do Hero/catálogo/contato estão fixos no `index.html`.

## 2. Banco recomendado: Supabase (PostgreSQL)
| Critério | Supabase | Firebase | JSON no Git/Vercel |
|---|---|---|---|
| Funciona em site estático sem servidor | Sim (API REST + SDK via CDN) | Sim | Sim, mas só leitura |
| Login do dono | Supabase Auth | Firebase Auth | Não tem |
| Regras de segurança no servidor | RLS em SQL (testado aqui) | Security Rules | Não |
| Upload de fotos | Storage (bucket) | Storage | Não |
| Dados relacionais (produto ↔ fotos ↔ promoção) | Nativo (SQL) | Documentos (mais manual) | — |
| Dono altera sem mexer no código | Sim | Sim | Não (exige deploy) |

**Por quê Supabase:** os dados são relacionais (produto tem várias fotos e promoções), o que SQL resolve de forma simples; Auth, banco e Storage vêm juntos; e a segurança é expressa em regras SQL que dá para testar. Firebase também serviria, mas pede modelagem em documentos e Security Rules em outra linguagem, sem ganho para este caso. JSON no Git não permite o dono editar sem código. *Confira o plano gratuito atual e seus limites no site do Supabase antes de decidir; não verifiquei preços.*

## 3. O que foi preparado

### Estrutura criada
```
db/schema.sql                # tabelas, RLS e Storage (idempotente)
db/seed.sql                  # migra os 5 produtos atuais (sem promoções demo)
js/data/store-data.js        # camada de acesso a dados (hoje: fonte local)
admin/index.html             # placeholder separado da vitrine (noindex)
admin/README.md              # módulos planejados do painel
docs/ARQUITETURA-ADMIN.md    # este arquivo
vercel.json                  # cabeçalhos noindex/no-store em /admin/*
.env.example  .gitignore     # variáveis (só exemplos) e proteção de .env
js/config.js                 # + campos supabase.url / anonKey (vazios)
```

### Modelo de dados (somente o necessário)
`products` (preço, tamanhos, estoque, destaque, `status` draft/published/hidden, ordem, `legacy_id`), `product_images`, `categories`, `promotions` (preço promocional, validade, ativa, ordem), `banners`, `site_content` (chave/valor dos textos), `admin_users` (quem é admin). Fotos no bucket `product-images`.

### Segurança (regra de ouro)
- **Visitante (chave anon):** só lê `published`; promoções só se ativas e dentro do prazo; nunca vê rascunhos/ocultos nem `admin_users`.
- **Escrita:** só quem está em `admin_users` (função `is_admin()`), validado **no banco**.
- Nenhuma senha/chave privada no navegador. A chave `anon` é pública por design; a `service_role` **nunca** vai ao site.
- `/admin/` sem link e com `noindex` é só organização, **não** segurança.

### Testes feitos no SQL (PostgreSQL 16 local, com `auth`/`storage` simulados)
`schema.sql` e `seed.sql` rodaram sem erro, 2× cada (idempotência). Verificado: visitante vê 5 produtos publicados e 1 promoção vigente (a de produto em rascunho e a vencida ficam invisíveis); visitante e usuário logado não-admin **não** conseguem inserir/alterar produto nem enviar arquivo; admin vê rascunhos/ocultos, altera preço e envia ao Storage. **Não testado:** Supabase real (Auth, Storage, SDK) — exige a conta do dono.

## 4. Passos do proprietário (quando for ativar)
1. Criar conta e um projeto em supabase.com (anote a região e uma senha forte do banco, **guardada só por você**).
2. SQL Editor → rodar `db/schema.sql`, depois `db/seed.sql`.
3. Authentication → Users → criar o usuário do dono (e-mail + senha). Desativar cadastro público (Authentication → Sign In / Providers → "Allow new users to sign up" desligado; o nome do menu pode variar). Mesmo com cadastro aberto, só quem está em `admin_users` consegue escrever.
4. Copiar o `id` (UUID) desse usuário e rodar no SQL Editor:
   `insert into public.admin_users (user_id) values ('UUID-DO-USUARIO');`
5. Project Settings → API: copiar **Project URL** e **anon public key** para `js/config.js > supabase` (valores públicos). Nunca copiar a `service_role` para o site.
6. Authentication → URL Configuration: adicionar o domínio do Vercel como Site URL.

### Variáveis
Ver `.env.example`. Como o site não tem build, **não há variáveis de ambiente lidas pelo navegador**: URL e anon key ficam em `js/config.js`. `SUPABASE_SERVICE_ROLE_KEY` só existiria em scripts locais, fora do Git.

## 5. Preparado × ainda NÃO implementado
| Preparado | Falta implementar |
|---|---|
| Esquema do banco, RLS, Storage, seed | Conexão real do site ao banco |
| Camada `HL_DATA` (formato definido) | Provider remoto; `main.js`/`cart.js` assíncronos |
| Página `/admin/` separada + plano de módulos | Login, painel, CRUD |
| Campos de promoção/validade/ordem no modelo | Gestão de promoções, banners, textos |
| `status` draft/published/hidden | Pré-visualização no painel |

## 6. Próximas etapas
1. Criar o projeto Supabase e executar os passos da seção 4.
2. Provider remoto em `HL_DATA` (`getProducts`, `getPromotions`, `getSiteContent`) com **fallback local** se o banco falhar.
3. Tornar `main.js`/`cart.js` assíncronos (esperar `HL_DATA`), mantendo o carrinho por `legacy_id`.
4. Login (`admin/js/auth.js`) e verificação de admin.
5. CRUD de produtos + upload de fotos para o Storage + ordenação.
6. Promoções (preço, validade, ordem; validar `promo_price < price`), banners e textos (`site_content`).
7. Pré-visualização de rascunhos, testes de segurança com o Supabase real e deploy.
