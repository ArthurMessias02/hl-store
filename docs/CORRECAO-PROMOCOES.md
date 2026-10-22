# Correção definitiva das promoções

## O que mudou
1. **Regra única** em `js/promotion-rules.js` (`window.HLPromo`). Seção de ofertas, card do catálogo, carrinho e mensagem do WhatsApp usam o mesmo preço.
2. Uma promoção só vale com `is_active === true`, produto existente, preço promocional > 0 e menor que o normal, e dentro de `starts_at`/`ends_at` (datas nulas = sem limite). Data ilegível = não vale.
3. Duplicadas para o mesmo produto: vence o menor `sort_order`; empate, a criada por último.
4. Falha ao carregar promoções = nenhum desconto (nunca preço fictício). Os produtos continuam aparecendo.
5. Cards do catálogo voltaram a mostrar preço riscado, preço promocional e selo OFERTA (somente com promoção válida). O carrinho cobra o mesmo valor.
6. Reordenação de produtos do painel admin restaurada (commit `571ab6e`, que o último commit havia desfeito).

## Ação necessária no Supabase (não feita por código)
Abra o painel admin > Promoções e confira os 2 registros. Qualquer oferta que não deve aparecer precisa ser **desativada ou excluída**: o código só esconde o que for inválido. Consultas de verificação (somente leitura) em `docs/INTEGRACAO.md`, seção 6.

## Testes
- `node tests/promotion-rules.test.js` (regra isolada).
- `python3 -I tests/e2e-promocoes.py <pasta-do-projeto>` (Chromium com Supabase simulado; precisa de Playwright).
