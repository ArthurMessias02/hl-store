/**
 * PRODUTOS (DADOS DE DEMONSTRAÇÃO)
 * ------------------------------------------------------------
 * Nomes, descrições, preços e tamanhos abaixo são FICTÍCIOS.
 * Substitua pelos dados reais da HL Store.
 *
 * Campos:
 *  id        identificador único
 *  name      nome da peça
 *  description  descrição curta
 *  price     preço em número (R$)
 *  sizes     tamanhos disponíveis para esta peça
 *  image     caminho da foto (troque por sua foto real em assets/images)
 *  inStock   true = EM ESTOQUE | false = INDISPONÍVEL
 *  featured  true = recebe selo "DESTAQUE"
 */
window.HL_PRODUCTS = [
  {
    id: 1,
    name: "Camiseta Tommy Hilfiger",
    description: "Camiseta Tommy Hilfiger com design moderno e acabamento impecável, perfeita para compor looks casuais e deixar o visual ainda mais elegante.",
    price: 89.99,
    sizes: ["P", "M", "G", "GG"],
    image: "assets/images/produto-01.webp",
    inStock: true,
    featured: true,
  },
  {
    id: 2,
    name: "Camiseta Polo Zara",
    description: "Algodão encorpado, gola firme e visual limpo para o dia a dia.",
    price: 109.99,
    sizes: ["P", "M", "G", "GG"],
    image: "assets/images/produto-02.webp",
    inStock: true,
    featured: false,
  },
  {
    id: 3,
    name: "Camisa Boss e Diesel",
    description: "Tecido leve com toque de seda, corte slim e elegância para qualquer ocasião.",
    price: 0.0,
    sizes: ["M", "G", "GG"],
    image: "assets/images/produto-03.webp",
    inStock: true,
    featured: false,
  },
  {
    id: 4,
    name: "Bermuda Diesel",
    description: "Tecido resistente, corte moderno e detalhes sutis para um look casual sofisticado.",
    price: 0.0,
    sizes: ["38", "40", "42", "44"],
    image: "assets/images/produto-04.webp",
    inStock: true,
    featured: true,
  },
];
