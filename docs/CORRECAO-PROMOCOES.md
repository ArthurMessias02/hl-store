# Correção das promoções

- Removidas as ofertas fictícias do modo local (`js/promotions.js`), incluindo o desconto artificial da Bermuda Diesel.
- A vitrine passa a carregar do Supabase apenas promoções com `is_active = true`.
- As regras de validade e preço continuam sendo verificadas na seção de ofertas.
- O preço normal da Bermuda Diesel não foi alterado: permanece em R$ 89,99 nos dados locais.

Se a loja estiver conectada ao Supabase e houver uma promoção antiga para a Bermuda Diesel, desative-a ou exclua-a no painel administrativo > Promoções.
