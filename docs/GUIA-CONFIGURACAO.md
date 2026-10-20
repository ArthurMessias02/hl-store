# HL Store — Guia do painel administrativo (para iniciantes)

Este guia tem duas partes: **(A) o que você precisa fazer** para ligar o painel
(uma vez só, ~20 minutos) e **(B) como tudo funciona**, explicado por etapa.

> Você **não** deve me enviar (nem a ninguém) senhas ou chaves secretas. Neste
> guia, a única senha é a SUA, digitada por você mesmo no Supabase e no painel.

---

## Parte A — Configurar (passo a passo)

### 1. Criar o projeto no Supabase
1. Entre em <https://supabase.com> e crie uma conta (pode usar o GitHub).
2. **New project** → nome `hl-store` → escolha uma **senha do banco** forte
   (guarde num gerenciador de senhas; você **não** vai usá-la no site) → região
   mais próxima (ex.: *South America (São Paulo)*) → **Create**.
3. Espere uns 2 minutos até o projeto ficar pronto.

**Como verificar:** o painel do Supabase abre mostrando o nome do projeto.

### 2. Criar as tabelas (banco de dados)
1. No Supabase: menu **SQL Editor** → **New query**.
2. Abra o arquivo `db/schema.sql` deste projeto, copie **tudo**, cole e clique **Run**.
3. Faça o mesmo com `db/seed.sql` (coloca os seus 5 produtos atuais no banco).

**Como verificar:** menu **Table Editor** → tabela `products` com 5 linhas.
Pode rodar os arquivos de novo sem medo: eles não duplicam nada.

### 3. Criar o SEU usuário (o administrador)
1. **Authentication → Users → Add user → Create new user**.
2. Digite **seu e-mail** e **uma senha que só você sabe**. Marque
   **Auto Confirm User**. Clique em criar.
3. **SQL Editor** → abra `db/first-admin.sql`, troque `TROQUE-PELO-SEU-EMAIL@exemplo.com`
   pelo **mesmo e-mail**, cole e **Run**.

**Como verificar:** o resultado mostra 1 linha com o seu e-mail.

Por que são dois passos? O usuário prova **quem você é** (login). A tabela
`admin_users` diz **quem pode mexer na loja**. Ter login não basta.

### 4. Desligar cadastro público (recomendado)
**Authentication → Sign In / Providers** → desligue **Allow new users to sign up**
(o nome do menu pode mudar um pouco). Mesmo que ficasse ligado, um visitante
cadastrado **não conseguiria** alterar nada, pois não está em `admin_users`.

### 5. Copiar os 2 dados PÚBLICOS para o site
No Supabase: **Project Settings → API** (ou **API Keys**).
1. Copie a **Project URL** (`https://xxxx.supabase.co`).
2. Copie a chave **pública**: `anon` (começa com `eyJ…`) **ou** a **publishable**
   (começa com `sb_publishable_…`). Os dois formatos funcionam neste projeto.
3. Abra `js/config.js` e preencha:
   ```js
   supabase: {
     url: "https://xxxx.supabase.co",
     anonKey: "cole-aqui-a-chave-publica",
   },
   ```

| Dado | Público ou secreto? | Onde fica |
|---|---|---|
| Project URL | Público | `js/config.js` |
| Chave `anon` / `publishable` | **Público** (feita para ir no navegador) | `js/config.js` |
| Chave `service_role` / `secret` | **SECRETA — nunca no site, nunca no Git** | (não usamos) |
| Senha do banco | **SECRETA** | só com você |
| Sua senha de administrador | **SECRETA** | só com você |

> Por que a chave pública é segura? Ela só dá o acesso de um visitante. O que
> um visitante pode ou não fazer é decidido pelas **regras RLS** que você
> criou no passo 2 — dentro do banco, onde ninguém consegue alterar pelo navegador.

### 6. Publicar
Faça o commit e o push dos arquivos como você já faz (Vercel publica sozinho).
Como o site não tem etapa de build, **não existem "variáveis de ambiente"**: a
URL e a chave pública ficam em `js/config.js` (ver `.env.example`).

### 7. Testar no celular
1. No celular, abra `https://SEU-SITE.vercel.app/admin/`.
2. Entre com o e-mail e a senha do passo 3.
3. Toque **+ Adicionar produto**, preencha, tire uma foto, **Salvar**.
4. Toque **+ Nova promoção**, escolha o produto, informe o preço, **Salvar**.
5. Abra a loja: o produto e a promoção aparecem.
6. Toque em **Sair da conta**.


```
(Funciona o mesmo; ele usa o Supabase da internet conforme o `js/config.js`.)

---

## Parte B — Como funciona (etapa por etapa)

### 1) Banco de dados — `db/schema.sql`
- **O que fazemos:** criamos tabelas (`products`, `product_images`, `promotions`, `categories`, …) e regras.
- **Por quê:** antes os produtos ficavam em `js/products.js`, que só muda editando código. No banco, os dados ficam salvos para todos os visitantes, em qualquer aparelho.
- **Como funciona:**
  - O **preço original não é copiado** para a promoção: a promoção guarda só o preço promocional e aponta para o produto. Se você mudar o preço do produto, o original e o desconto se atualizam sozinhos.
  - O banco **recusa** preço promocional ≥ preço normal e **recusa** baixar o preço do produto abaixo do da promoção (triggers). Mesmo que alguém burlasse o painel, o banco bloqueia.
  - Só pode haver **uma promoção por produto** (para mudar, edite; para pausar, desative). Isso evita duplicar no carrossel.
  - Excluir um produto exclui as promoções dele (não sobram promoções "órfãs").
- **Como verificar:** Table Editor mostra as tabelas.

### 2) Segurança — as regras RLS (também em `db/schema.sql`)
Três camadas diferentes (não confunda):
1. **Tela de login** (`admin/js/app.js`): só pede e-mail e senha.
2. **Supabase Auth**: confere a senha e entrega um **token temporário** (vale ~1 hora e é renovado sozinho).
3. **RLS no banco**: a cada leitura/gravação o banco olha o token e decide.
   - Visitante: só **lê** produtos `published` e promoções ativas e dentro do prazo.
   - Administrador (listado em `admin_users`): lê e **escreve** tudo.
   - Qualquer outra pessoa: **não escreve nada**.

Esconder um botão **não protege**; a proteção real é o item 3.

### 3) Painel — pasta `admin/`
| Arquivo | Função |
|---|---|
| `admin/index.html` | Página única do painel |
| `admin/css/admin.css` | Visual (celular primeiro) |
| `admin/js/client.js` | Conversa com o Supabase (login, banco, fotos) usando só `fetch` |
| `admin/js/data.js` | Regras de negócio: produtos, promoções, fotos, validações |
| `admin/js/views.js` | As telas: início, produtos, promoções, formulários |
| `admin/js/ui.js` | Peças de tela: avisos, confirmação, botão "ocupado" |
| `admin/js/app.js` | Login, sair, sessão expirada e rotas (`#/produtos`, `#/promocoes`…) |

Os endereços usam `#` (ex.: `/admin/#/produtos`) para funcionar em qualquer hospedagem estática.

- **Fotos:** antes de enviar, o painel **reduz a foto** (lado maior até 1600 px, em WebP; até 8 fotos por produto) para economizar internet e espaço. Vão para o **Storage** do Supabase (bucket `product-images`); a loja usa o endereço público delas.
- **Sessão expirada:** se o token não puder ser renovado, o painel volta ao login com um aviso.
- **Sair:** apaga o token do navegador e encerra a sessão no servidor.

### 4) Vitrine — `js/data/store-data.js` e `js/boot.js`
- **O que mudou:** a loja agora busca produtos e promoções no banco ao abrir (só **leitura**, com a chave pública).
- **`js/boot.js`:** espera os dados chegarem e só então carrega `cart.js`, `main.js`, `promotions-ui.js` e `cart-ui.js`, para que tudo nasça com os dados certos. O visual não mudou.
- **Se o banco falhar:** os produtos aparecem pela cópia local (`js/products.js`), e as **promoções ficam ocultas** (nunca mostramos oferta de demonstração como se fosse real).
- **Sem Supabase configurado** (`js/config.js` vazio): a loja funciona como antes, com os dados locais.
- **Carrinho:** o número de cada produto (`public_id`) é o mesmo dos 5 produtos atuais, então carrinhos já salvos continuam válidos.

---

## O que foi testado de verdade
Montei um ambiente local com **PostgreSQL real**, **PostgREST real** (a mesma peça que o Supabase usa para a API do banco) e um "gateway" que imita o login e o Storage do Supabase. Nele rodaram **87 verificações automáticas** em navegador (celular e desktop) — todas passaram. Elas cobrem: visitante e usuário comum **sem** permissão de escrita; login/logout; sessão expirada e renovação; cadastrar, editar, ocultar e excluir produtos; fotos; criar, editar, desativar, reativar e excluir promoções; promoções vencidas/agendadas; carrossel atualizado; validações; falta de conexão.

**Não foi possível testar** com o Supabase de verdade (precisa da sua conta). Por isso, ao configurar, refaça o roteiro do passo 7. O que pode diferir: detalhes de menus do site do Supabase e o comportamento exato do login/Storage reais.

## Limitações atuais
- Um único administrador (por escolha). Recuperar senha: pelo Supabase (**Authentication → Users**).
- Uma promoção por produto; preço promocional é um valor (não há "% de desconto" digitável — ele é calculado).
- Categorias existem no banco e no formulário, mas a loja pública ainda não as exibe.
- A vitrine consulta o banco ao abrir a página (sem tempo real).
- Pagamento não existe (pedidos continuam indo para o WhatsApp).

## Custos (consultei as páginas oficiais em 20/10/2026; confira antes de decidir)
- **Supabase — plano Free:** US$ 0; 500 MB de banco, 1 GB de arquivos, 5 GB de tráfego, 2 projetos ativos. **Atenção:** projetos Free **pausam após 7 dias de inatividade** (é preciso reativar no painel do Supabase). O plano **Pro** parte de US$ 25/mês. Fonte: <https://supabase.com/pricing>.
- **Vercel — plano Hobby:** gratuito, mas **restrito a uso pessoal e não comercial**. Pela política oficial, um site que **anuncia a venda de produtos** conta como uso comercial e exigiria o plano **Pro**. Veja a política e fale com o suporte da Vercel se tiver dúvida: <https://vercel.com/docs/limits/fair-use-guidelines>. (Alternativa: outra hospedagem estática; o site não depende da Vercel.)
- WhatsApp: gratuito para este uso.

## Próximas etapas sugeridas (fora do escopo desta entrega)
1. Fazer o roteiro de testes no Supabase real e ajustar o que for preciso.
2. Gerenciar banners e textos da página inicial pelo painel (as tabelas já existem).
3. Ordenar produtos arrastando.
4. Exibir categorias/filtros na loja.
5. Hospedagem/plano adequados ao uso comercial e rotina de backup do banco.
