/**
 * PROMOÇÕES (DADOS DE DEMONSTRAÇÃO)
 * ------------------------------------------------------------
 * ATENÇÃO: os preços promocionais abaixo são EXEMPLOS (demo: true).
 * Não são ofertas reais da loja. Enquanto houver itens com demo: true,
 * a seção mostra o aviso "Exemplos demonstrativos".
 * Para oferta real: troque promoPrice e remova "demo: true" (ou apague o item).
 *
 * Campos:
 *  productId  id do produto em js/products.js (nome, foto e preço original vêm de lá)
 *  promoPrice preço promocional (R$); precisa ser menor que o preço original
 *  startsAt   (opcional) "AAAA-MM-DD" início da oferta
 *  endsAt     (opcional) "AAAA-MM-DD" último dia da oferta
 *  demo       true = exemplo demonstrativo
 *
 * A ordem da lista é a ordem do carrossel.
 * Futuramente esta lista virá do banco de dados; a renderização
 * (js/promotions-ui.js) só lê window.HL_PROMOTIONS, então a troca é simples.
 */
window.HL_PROMOTIONS = [
  { productId: 1, promoPrice: 74.99, demo: true },
  { productId: 2, promoPrice: 89.99, demo: true },
  { productId: 3, promoPrice: 69.99, demo: true },
  { productId: 5, promoPrice: 64.99, demo: true },
  { productId: 4, promoPrice: 74.99, demo: true },
];
