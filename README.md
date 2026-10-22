# HL Store — Landing Page

Landing page mobile-first da HL Store (moda masculina casual, social e premium), feita com HTML, CSS e JavaScript puros. Sem build, sem dependências.

## Estrutura

```
hl-store/
├── index.html          # Estrutura (HTML semântico)
├── css/styles.css      # Estilos e animações
├── js/
│   ├── config.js       # WhatsApp, Instagram, nome da marca
│   ├── products.js     # Dados dos produtos (edite aqui)
│   ├── promotions.js   # Dados das promoções (preço promocional por productId)
│   ├── promotions-ui.js# Carrossel "Ofertas Especiais" abaixo do hero
│   ├── data/store-data.js # Dados da vitrine: banco (se configurado) ou arquivos locais
│   ├── boot.js         # Espera os dados e carrega cart/main/promoções/cart-ui
│   ├── cart.js         # Carrinho: dados, localStorage, mensagem do WhatsApp
│   ├── main.js         # Renderização, galeria, WhatsApp, "ver mais", animações
│   └── cart-ui.js      # Carrinho: botão da sacola, painel lateral, avisos
├── db/                 # schema.sql, seed.sql, first-admin.sql (Supabase)
├── admin/              # painel administrativo (login, produtos, promoções)
├── docs/GUIA-CONFIGURACAO.md  # como ligar o painel + como tudo funciona (iniciante)
├── docs/ARQUITETURA-ADMIN.md  # decisões de arquitetura e escolha do banco
├── assets/images/      # Imagens (hoje: SVGs de demonstração)
└── README.md
```

## Executar localmente

Abra o `index.html` direto no navegador, ou, para simular melhor a hospedagem:

```bash
cd hl-store
python3 -m http.server 8000
# acesse http://localhost:8000
```

Teste no celular usando o modo responsivo do navegador (larguras de 360 a 430 px).


## Como editar

- **Produtos:** `js/products.js` (nome, descrição, preço, tamanhos, imagem, `inStock`, `featured`).
- **WhatsApp/Instagram/marca:** `js/config.js`.
- **Estoque:** troque `inStock` entre `true` e `false`. Peças indisponíveis mostram o status e um botão de *consulta de reposição*.
- **Logo:** é um SVG embutido no `index.html` (hero: `logo-svg--hero`; rodapé: `logo-svg--footer`). Para trocar "STORE" por "STORIES", edite o texto de `class="logo-svg__name"` nos dois lugares. A logo original enviada está salva em `assets/images/logo-original.jpg` apenas como referência.
- **Foto do hero (fundo):** no `index.html`, dentro de `<div class="hero__bg">`, troque `assets/images/hero.svg` pelo arquivo da sua foto (ex.: `assets/images/hero.jpg`, vertical, ~1080×1600 px).
- **Fotos:** coloque os arquivos em `assets/images/` (proporção 4:5, ex.: 1200×1500 px, em WebP ou JPG otimizado) e atualize o campo `image`.

## Carrinho

O cliente escolhe o tamanho, toca em **ADICIONAR AO CARRINHO** (quantas peças quiser) e, no painel da sacola, em **FINALIZAR PEDIDO NO WHATSAPP**. O WhatsApp abre com a mensagem pronta:

```
Olá! Gostaria de fazer um pedido na HL Store:

2x Camiseta Tommy Hilfiger — Tam. M — R$ 179,98 (2 × R$ 89,99)
1x Camiseta Polo Zara — Tam. G — R$ 105,99

Total: R$ 285,97

Aguardo a confirmação de disponibilidade e a forma de pagamento.
```

- **Sem pagamento no site.** O pedido é só enviado para o WhatsApp.
- **Persistência:** o carrinho fica salvo no navegador (`localStorage`, chave `hl-store-cart`) e sobrevive a recarregar a página.
- **Preço sempre do `products.js`:** o carrinho guarda só id, tamanho e quantidade. Se você mudar um preço, o carrinho já mostra o novo valor. Peças que ficarem indisponíveis ou tiverem o tamanho removido saem do carrinho sozinhas.
- **Peça indisponível** (`inStock: false`) não tem botão de adicionar, só a consulta de reposição.
- **Textos e limites** em `js/config.js`: `cartWhatsappIntro`, `cartWhatsappOutro`, `cartMaxPerItem` (10 por peça/tamanho) e `cartMaxLines` (20 peças diferentes por pedido).
- **Foto no carrinho:** usa a primeira foto da peça (`images[0]`, ou `image`).

### Testar antes de publicar
1. Adicionar sem escolher tamanho (deve avisar).
2. Adicionar 2 peças diferentes e a mesma peça em 2 tamanhos.
3. Aumentar, diminuir e remover; recarregar a página (o carrinho deve continuar).
4. Tocar em **FINALIZAR PEDIDO** e conferir a mensagem e o número no WhatsApp.
5. Fechar o painel com o X, com a tecla Esc e (no computador) clicando no fundo.


## Ofertas Especiais (carrossel abaixo do hero)

- Dados em `js/promotions.js` (`window.HL_PROMOTIONS`): `productId`, `promoPrice`, `isActive`, `startsAt`/`endsAt` opcionais. Nome, foto e preço original vêm de `products.js`.
- `js/promotions.js` começa vazio. As promoções reais vêm do Supabase (painel admin). No modo local, cada item precisa de `isActive: true`. A regra de validade está em `js/promotion-rules.js`.
- Itens sem estoque, com preço promocional inválido (>= preço original) ou fora do período somem do carrossel. Sem nenhum item válido, a seção inteira some.
- Cada card leva ao produto no catálogo (onde escolhe tamanho e adiciona ao carrinho).


## Painel administrativo e banco de dados
Painel em `/admin/` (celular primeiro): login, produtos (com fotos), promoções e ligação com a loja.
Usa Supabase (login, PostgreSQL e Storage). **Siga `docs/GUIA-CONFIGURACAO.md`** para ativar.
Enquanto `supabase.url`/`anonKey` em `js/config.js` estiverem vazios, a loja usa os dados locais (`js/products.js`).
