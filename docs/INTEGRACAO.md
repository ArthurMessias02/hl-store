# Regra única de promoção — como ligar no site

Arquivos desta entrega:

- `js/promotion-rules.js` — o módulo (`window.HLPromo`). Copie para a pasta `js/` do projeto.
- `tests/promotion-rules.test.js` — testes (`node tests/promotion-rules.test.js`).
- Este guia.

Os trechos abaixo foram escritos olhando o código do ZIP antigo (`store-data.js`, `promotions-ui.js`, `main.js`, `cart.js`). Os nomes de função do seu projeto atual (com página de produto e reordenação) podem ser diferentes. A ideia é a mesma: **toda tela chama `HLPromo.current(produto)`** e não calcula preço por conta própria.

## 1. Carregar o módulo

No `index.html` (e em qualquer página de produto), antes de `store-data.js`:

```html
<script src="js/promotion-rules.js"></script>
```

No `boot.js`, a lista de scripts que carregam depois do banco não muda.

## 2. `js/data/store-data.js` — buscar e validar num lugar só

Na `load()`, troque a consulta de promoções pela função do módulo. Ela pede todas as colunas da regra (`is_active`, `starts_at`, `ends_at`, `sort_order`, `created_at`) e **nunca lança erro**:

```js
// antes: get("promotions", "select=product_id,promo_price,starts_at,ends_at&order=...", ctl.signal)
// depois:
HLPromo.fetchPromotions(BASE, headers(), ctl.signal)   // vai no Promise.all no lugar da linha antiga
```

Depois de montar `products` e `byUuid`:

```js
const promoRes = r[2];                    // { ok, rows, error }
if (promoRes.ok) {
  const promos = promoRes.rows.map(function (row) { return HLPromo.fromRow(row, byUuid); });
  HLPromo.setData(promos, products);      // valida TUDO aqui
} else {
  HLPromo.setError(promoRes.error);       // falha = nenhum desconto
}
// remova o bloco antigo seen/filter/map e o window.HL_PROMOTIONS = ...
```

No `catch` (banco fora do ar), troque `state.promotions = []; window.HL_PROMOTIONS = [];` por `HLPromo.setError(err);`.

No modo local sem Supabase, `js/promotions.js` deve ficar `window.HL_PROMOTIONS = [];` e o `store-data.js` chama `HLPromo.setData(window.HL_PROMOTIONS, window.HL_PRODUCTS)`.

## 3. Seção de ofertas (`js/promotions-ui.js`)

Apague `toTime` e a lógica de validade dentro de `activeItems()`. Fica:

```js
function activeItems() {
  return PRODUCTS.filter(function (p) { return p.inStock && HLPromo.current(p).onSale; })
    .map(function (p) { return { p: p, info: HLPromo.current(p) }; });
}
```

No `card()`, use `it.info.current`, `it.info.original` e `it.info.discountPct` no lugar de `promo.promoPrice`, `p.price` e do cálculo de `off`. A linha `if (!items.length) { section.hidden = true; return; }` já esconde a seção quando não há oferta válida.

## 4. Card do catálogo e página do produto (`main.js` / página do produto)

Onde hoje existe `el("p", "product__price", brl.format(p.price))`:

```js
const info = HLPromo.current(p);
const price = el("p", "product__price reveal");
if (info.onSale) {
  const old = el("s", "product__price-old", brl.format(info.original));
  price.append(old, " ", el("strong", "", brl.format(info.current)));
  // selo "OFERTA": crie SOMENTE aqui dentro deste if
} else {
  price.textContent = brl.format(info.original);   // sem selo, sem riscado
}
```

O selo "OFERTA" e o preço riscado só podem ser criados dentro do `if (info.onSale)`. Se existir um selo fixo no HTML ou no CSS, ele precisa ser removido, porque o módulo só consegue controlar o que é criado a partir dele.

## 5. Carrinho e WhatsApp (`js/cart.js`)

Em `lines()`, o preço unitário vem do módulo:

```js
const unit = HLPromo.current(p).currentCents;     // antes: toCents(p.price)
```

`message()` e `totalCents()` usam `lines()`, então o total e a mensagem do WhatsApp passam a bater com o card. Chame `HLCart.lines()` de novo (por exemplo ao abrir o carrinho) para recalcular se uma promoção expirou com a página aberta.

No `cart-ui.js`, o preço unitário da linha deve vir de `line.unitCents`, e o total de `line.totalCents`.

## 6. Verificação no banco (somente leitura)

Rode no **SQL Editor do Supabase**. Os comandos não alteram dados. Eles mostram o que os dois registros têm de fato e o que o visitante anônimo enxerga.

```sql
-- a) registros completos, com o produto e se valem agora
select pr.id, p.name, p.price as preco_normal, pr.promo_price, pr.is_active,
       pr.starts_at, pr.ends_at, pr.sort_order, pr.created_at,
       (pr.is_active
         and pr.promo_price > 0 and pr.promo_price < p.price
         and (pr.starts_at is null or pr.starts_at <= now())
         and (pr.ends_at   is null or pr.ends_at   >= now())) as vale_agora
from public.promotions pr
join public.products p on p.id = pr.product_id
order by pr.sort_order, pr.created_at desc;

-- b) a política que decide o que o visitante anônimo enxerga
select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'promotions';

-- c) o índice de "uma promoção por produto" existe?
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'promotions';
```

Como ler o resultado:

- **(a)** Se a linha do Shorts Diesel mostrar `promo_price = 65.99`, `is_active = true` e `vale_agora = true`, o desconto é um dado real e válido no banco. Nesse caso o código está certo ao exibi-lo. Se o desconto não é desejado, desative a promoção no painel admin (botão **Desativar**) ou exclua o registro. Eu não alterei nada.
- **(b)** A política `public read promotions` deve conter `is_active`, `starts_at`, `ends_at` e a checagem de produto publicado. Se ela estiver diferente (por exemplo `using (true)`), o anônimo recebe promoções inativas, e o filtro do módulo passa a ser a única proteção. Para recriar a política original, rode o trecho `public read promotions` de `db/schema.sql`.
- **(c)** Deve aparecer `promotions_product_uidx`. Sem ele, o banco aceita duas promoções para o mesmo produto, e a regra de desempate do módulo decide qual vale: menor `sort_order`, depois a mais recente.

## 7. Publicar na Vercel

O projeto é estático, sem build:

1. Copie `js/promotion-rules.js` para o projeto e faça as ligações das seções 1 a 5.
2. `git add -A && git commit -m "regra única de promoção" && git push`. A Vercel publica sozinha.
3. Abra o site com **Ctrl+Shift+R** (ou aba anônima) para ignorar o cache do navegador. Um JS antigo em cache pode manter o desconto na tela.
4. Confira o Shorts Diesel no card, na página e no carrinho: os três devem mostrar o mesmo preço.
