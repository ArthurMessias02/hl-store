/**
 * PRODUTOS (DADOS DE DEMONSTRAÇÃO)
 * ------------------------------------------------------------

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
    sizes: ["P", "M", "G","GG"],
    image: "assets/images/produto-01.webp",
    images: [
      "assets/images/produto-01.webp",
      "assets/images/produto-01-02.webp",
      "assets/images/produto-01-03.webp",
    ],
    inStock: true,
    featured: true,
  },
  {
    id: 2,
    name: "Camiseta Polo Zara",
    description: "Elegância e versatilidade em uma única peça. Um modelo atemporal, perfeito para compor produções sofisticadas tanto no dia a dia quanto em ocasiões especiais.",
    price: 105.99,
    sizes: ["P", "M", "G","GG"],
    image: "assets/images/produto-02.webp",
    images: [
      "assets/images/produto-02.webp",
      "assets/images/produto-02-02.webp",
      "assets/images/produto-02-03.webp",
      "assets/images/produto-02-04.webp",
    ],
    inStock: true,
    featured: false,
  },

  {
    id: 3,
    name: "Camiseta Zara Basica",
    description: "Camiseta Zara Basica com design minimalista e elegante, perfeita para quem busca conforto e estilo em uma única peça.",
    price: 85.99,
    sizes: ["M", "G",],
    image: "assets/images/produto-03.webp",
    images: [
      "assets/images/produto-03.webp",
      "assets/images/produto-03-02.webp",
    ],
    inStock: true,
    featured: true,
  },



  {
    id: 5,
    name: "Camisa Boss e Diesel",
    description: "Tecido leve com toque de seda, corte slim e elegância para qualquer ocasião.",
    price: 79.99,
    sizes: ["P", "M", "G", "GG"],
    image: "assets/images/produto-04.webp",
    images: [
      "assets/images/produto-04.webp",
      "assets/images/produto-04-02.webp",
      "assets/images/produto-04-03.webp",
      "assets/images/produto-04-04.webp",
      "assets/images/produto-04-05.webp",
    ],
    inStock: true,
    featured: true,
  },
  {
    id: 4,
    name: "Bermuda Diesel",
    description: "Tecido resistente, corte moderno e detalhes sutis para um look casual sofisticado.",
    price: 89.99,
    sizes: ["M", "G", "GG"],
    image: "assets/images/produto-05.webp",
    inStock: true,
    featured: true,
  },
];
