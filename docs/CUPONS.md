# Cupons de desconto — HL Store

Sistema de cupons administrável, integrado ao carrinho e ao painel. JavaScript puro + Supabase.
**Quem calcula e valida é o banco** (`db/coupons.sql`); o navegador só mostra o resultado.

## 1. Como ligar (passo a passo)

1. **Supabase → SQL Editor:** rode, nesta ordem, `db/schema.sql` (já rodado antes) e depois **`db/coupons.sql`**.
   Pode rodar de novo à vontade: não duplica o cupom `BEMVINDO10`, não sobrescreve ajustes feitos no painel e não toca em nenhuma tabela existente.
2. Abra o painel (`/admin`) → **Cupons**. O `BEMVINDO10` já aparece (10%, carrinho inteiro, 1 uso por WhatsApp).
3. Na loja, adicione uma peça, abra o carrinho, toque em **TENHO UM CUPOM**, digite `BEMVINDO10`.
4. Faça um pedido de teste: ele aparece no painel em **Cupons → Ver pedidos com cupom** como *Reservado*.

Nada novo em `js/config.js` além de `welcomeCouponCode` (o código mostrado no popup de cadastro; precisa ser igual ao cupom do banco).
Nenhuma chave nova: só a chave pública `anon`, como já era.

## 2. Como funciona o fluxo de venda (importante)

A loja fecha pedidos pelo **WhatsApp**: não existe pedido pago/registrado dentro do site. Por isso:

| Momento | O que acontece | Conta como "uso"? |
|---|---|---|
| Cliente digita o cupom | `validate_coupon` calcula o desconto no banco. **Não grava nada.** | Não |
| Cliente toca em *Finalizar pedido no WhatsApp* | `reserve_coupon` confere de novo, **reserva** o cupom por **48 h** e gera o número do pedido (`HL-XXXXXX`), que vai na mensagem do WhatsApp. | Não (só segura uma vaga) |
| Você fecha a venda no WhatsApp e toca em **Confirmar compra** no painel | `confirm_coupon_redemption` consome o cupom. | **Sim** |
| Cliente desiste / reserva passa de 48 h | Libera a vaga sozinha. | Não |

Ou seja: o desconto na mensagem do WhatsApp é **calculado e registrado pelo banco**, mas o **pagamento não é verificado pelo site**. A confirmação é um ato seu, no painel. O cliente pode editar o texto do WhatsApp, mas o painel mostra o que o banco reservou (itens, desconto e total) pelo número do pedido.

Não há integração de pagamento. Nada foi inventado nesse sentido.

## 3. Regras comerciais implementadas

- **Código:** 3 a 32 caracteres (`A–Z`, `0–9`, `-`, `_`), gravado em maiúsculas, **único sem diferenciar maiúsculas/minúsculas ou espaços** (`bemvindo10`, ` BEMVINDO10 ` e `BEMVINDO10` são o mesmo cupom). Não proibimos caracteres parecidos (`O`/`0`) porque o próprio `BEMVINDO10` os tem.
- **Tipos:** percentual (0,01 a 100) ou valor fixo (até R$ 99.999,99).
- **Escopo:** carrinho inteiro, um produto ou uma categoria. Só as peças do escopo recebem desconto.
  Se o produto/categoria do cupom for excluído, o cupom é **desativado automaticamente** (a exclusão do produto não falha).
- **Validade:** início e término com data e hora.
- **Valor mínimo:** conta o **subtotal do carrinho inteiro**, já com as promoções.
- **Limite global:** conta usos **confirmados + reservas ativas**. Conferido com o cupom travado no banco: pedidos simultâneos não passam do limite (testado com 30 pedidos simultâneos para limite 3 → exatamente 3).
- **Limite por cliente:** o único identificador confiável aqui é o **WhatsApp que VOCÊ informa ao confirmar a compra**. O limite é aplicado nessa hora (compara o número normalizado, então `(15) 99825-0486` e `15998250486` são o mesmo cliente). Nome/telefone digitados pelo visitante **não** são usados como prova de identidade.
- **Cupom × promoção (regra explícita):** por padrão o cupom **não vale para peças que já estão em promoção**. Se o cupom for marcado *"Vale também em peças em promoção"*, o desconto incide sobre o **preço promocional** (nunca sobre o preço "de"). Nos dois casos não há desconto duplo sobre o mesmo valor, e o subtotal do carrinho continua sendo o das promoções.
- **Arredondamento:** tudo em **centavos inteiros**. Percentual: calculado **uma vez** sobre o total elegível e arredondado ao centavo mais próximo (meio centavo sobe). Ex.: 10% de R$ 10,05 = R$ 1,005 → **R$ 1,01**; 10% de R$ 89,99 = R$ 8,999 → **R$ 9,00**. Valor fixo: `min(valor, elegível)`. O desconto nunca passa do valor elegível, então o total nunca fica negativo.

### BEMVINDO10 ("10% na primeira compra")

Criado pela migração como 10% no carrinho inteiro, não vale em peça já em promoção, **limite de 1 uso confirmado por WhatsApp**.
**O sistema não consegue provar que é a primeira compra da pessoa**: o site não registra compras anteriores e o cadastro (popup) não é prova de compra. O que ele garante é: *este WhatsApp não pode ter o cupom confirmado duas vezes*. Pedidos feitos antes desta versão (ou com outro número) não são vistos. Se quiser a regra "primeira compra" de verdade, é preciso um registro de compras confiável (hoje, só as confirmações feitas no painel).
Mostrar o código no popup **não** libera desconto: ele só vale se passar pela validação do banco.

## 4. Segurança

- **RLS:** `coupons` e `coupon_redemptions` não têm nenhuma política para visitantes. Só `is_admin()` lê/escreve cupons; usos só são **lidos** pelo admin, e alterados apenas pelas funções `confirm_/cancel_coupon_redemption` (que conferem `is_admin()` por dentro).
- **Funções públicas:** só `validate_coupon` e `reserve_coupon` são liberadas a visitantes. As internas (`_coupon_evaluate`, `_coupon_uses`) e as de admin tiveram `EXECUTE` revogado de `anon` (o Supabase concede por padrão).
- **Preço:** o navegador envia apenas `{ id, qty }`. O banco ignora qualquer preço enviado e lê `products`/`promotions`.
- **Concorrência:** a linha do cupom é travada (`FOR UPDATE`) durante a reserva.
- **Nenhuma chave privilegiada** no front-end (teste automático confere que a chave do `config.js` é `anon`).
- Políticas existentes não foram alteradas.

## 5. Painel (Cupons)

- **Lista:** busca por código, situação (Ativo / Inativo / Expirado / Agendado / Esgotado), tipo e escopo, validade, usos e reservas, ativar/desativar.
- **Formulário:** criar/editar com validação (código, percentual ≤ 100, valores positivos, datas coerentes, limites inteiros ≥ 1). O banco repete todas as regras.
- **Excluir:** pede confirmação. O histórico de pedidos que usaram o cupom é mantido (com o código gravado).
- **Pedidos com cupom:** *Confirmar compra* (pede o WhatsApp quando o cupom tem limite por cliente) e *Cancelar* (libera a vaga; também devolve um uso já confirmado).

## 6. Arquivos

**Criados**
`db/coupons.sql` · `js/coupons.js` · `admin/js/coupons.js` · `docs/CUPONS.md` ·
`tests/coupons-client.test.js` · `tests/e2e-cupons.py` · `tests/run-sql-tests.sh` · `tests/run-all.sh` · `tests/sql/00-supabase-stub.sql` · `tests/sql/coupons.test.sql`

**Alterados**
`index.html` (campo de cupom e resumo no carrinho; popup) · `css/styles.css` (estilos do cupom no carrinho e do novo popup) · `js/cart.js` (mensagem do WhatsApp aceita cupom) · `js/cart-ui.js` · `js/boot.js` (carrega `coupons.js`) · `js/config.js` (`welcomeCouponCode`) · `js/customer-popup.js` ·
`admin/index.html` (menu e script) · `admin/js/app.js` (rotas `#/cupons…`) · `admin/js/client.js` (`rest.rpc`) · `admin/js/customers.js` (corrige o destaque do menu, que apagava o item ativo dos outros) · `admin/css/admin.css` · `vercel.json` · `README.md`

Nenhuma tabela existente foi alterada.

## 7. Testes executados

Rodar tudo: `PGHOST=... PGPORT=... PGUSER=... tests/run-all.sh` (precisa de Node, Python + Playwright/Chromium e um PostgreSQL 14+ descartável).

| Suíte | Resultado |
|---|---|
| `node --check` em todos os JS | ok |
| `promotion-rules.test.js` (regra de promoções, já existia) | 18 grupos ok |
| `coupons-client.test.js` (cliente, carrinho, WhatsApp, consistência do código de boas-vindas, chave `anon`) | 32 ok |
| `run-sql-tests.sh` — **PostgreSQL 16 real**: constraints, RLS/permissões, percentual, fixo, arredondamento, expirado/inativo/agendado, produto/categoria, mínimo, promoções, limite global, reserva/confirmação/cancelamento, limite por WhatsApp, entradas malformadas, exclusão de produto/categoria, idempotência da migração | 119 ok |
| Concorrência: 30 pedidos simultâneos, limite 3 | exatamente 3 reservas (e o teste **falha** se o travamento for removido: 6 passaram sem ele) |
| `e2e-promocoes.py` (regressão das promoções) | 20 ok |
| `e2e-cupons.py` — Chromium, loja (celular 390 px e desktop) e painel, contra o banco real | 68 ok |

Cobre os itens do roteiro: criar/editar/ativar/desativar/excluir; duplicado e inválidos; percentual e fixo; expirado e inativo; produto/categoria; mínimo e limites; total sem duplicar desconto; promoções preservadas; usuário comum barrado (login do painel e RLS); `BEMVINDO10` do popup = config = banco; carrinho no celular (sem rolagem horizontal, rodapé cabe na tela); console sem erros.

## 8. O que NÃO foi testado (faça depois de configurar)

- **Supabase real.** O banco dos testes é PostgreSQL 16 de verdade com papéis/`auth.uid()` simulados, e o PostgREST/Auth foram **simulados** no teste. Rode `db/coupons.sql` no seu projeto e repita: aplicar `BEMVINDO10` no carrinho, finalizar, e confirmar o pedido no painel.
- **iPhone/Safari e Android reais.** O carrinho abre a aba do WhatsApp no clique e preenche o endereço quando o banco responde; navegadores diferentes tratam isso de formas diferentes (se bloquear, ele abre na mesma aba).
- Cadastro/login do popup com Supabase Auth real (e-mails de confirmação).

## 9. Limitações conhecidas e pontos de atenção

1. **Sem registro verificável de compra.** A venda só é "real" quando você confirma no painel. "Primeira compra" não é garantida (ver seção 3).
2. **Reservas podem ser abusadas.** Qualquer visitante pode reservar um cupom de **uso limitado** e segurá-lo por 48 h (o identificador anônimo reduz repetição do mesmo navegador, mas não impede quem o troca). Para cupons com limite pequeno, cancele reservas suspeitas no painel ou reduza `coupon_reservation_window()` no SQL.
3. **Descoberta de códigos.** As mensagens claras ("expirou", "não está ativo") revelam que o código existe. Não há limite de tentativas além do que o Supabase já aplica à API; considere um limite de taxa na borda (Vercel/Cloudflare) se houver tentativa de adivinhar códigos.
4. **Contas de clientes (popup de cadastro com Supabase Auth)** viram usuários `authenticated`. Todas as políticas de cupom usam `is_admin()`, então eles não têm acesso. **Confira** se as tabelas `customers` (e qualquer política sua escrita como `to authenticated using (true)`) não ficaram abertas a esses usuários: `customers` e `register_customer` **não estão em nenhum `.sql` deste projeto**, então não pude revisar. Se não quiser contas de clientes, desligue "Allow new users to sign up" em Authentication.
5. O desconto em tela depende de uma consulta ao banco; sem internet o cupom não é aplicado (o pedido sem cupom continua funcionando).
6. Se uma promoção mudar enquanto a página está aberta, o cupom pede para recarregar em vez de mostrar um total que não bate.
7. O limite por cliente só é conferido na confirmação (você precisa informar o WhatsApp correto).
