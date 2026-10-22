# Correção de promoções indevidas

1. O arquivo local não contém mais ofertas de demonstração.
2. A vitrine busca a coluna `is_active` do Supabase e ignora promoções desativadas.
3. A Bermuda Diesel não recebe desconto automaticamente por estar cadastrada no catálogo.

Importante: no painel administrativo, abra Promoções e desative/exclua a oferta antiga da Bermuda Diesel (e qualquer oferta indevida). A alteração no código impede que ofertas inativas sejam mostradas, mas não apaga registros do banco. Depois, publique os arquivos atualizados na Vercel.
