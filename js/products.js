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
    name: "Polo Premium",
    description: "Malha piquet de toque macio, caimento ajustado e acabamento discreto.",
    price: 189.9,
    sizes: ["P", "M", "G", "GG"],
    image: "assets/images/produto-01.svg",
    inStock: true,
    featured: true,
  },
  {
    id: 2,
    name: "Camiseta Essential",
    description: "Algodão encorpado, gola firme e visual limpo para o dia a dia.",
    price: 99.9,
    sizes: ["P", "M", "G", "GG"],
    image: "assets/images/produto-02.svg",
    inStock: true,
    featured: false,
  },
  {
    id: 3,
    name: "Camisa Social Slim",
    description: "Tecido leve com toque de seda, corte slim e elegância para qualquer ocasião.",
    price: 229.9,
    sizes: ["M", "G", "GG"],
    image: "assets/images/produto-03.svg",
    inStock: true,
    featured: false,
  },
  {
    id: 4,
    name: "Calça de Alfaiataria",
    description: "Corte reto, cintura confortável e caimento impecável.",
    price: 299.9,
    sizes: ["38", "40", "42", "44"],
    image: "assets/images/produto-04.svg",
    inStock: false,
    featured: false,
  },
  {
    id: 5,
    name: "Blazer Urban",
    description: "Estrutura leve e silhueta moderna para compor looks sociais com personalidade.",
    price: 449.9,
    sizes: ["P", "M", "G"],
    image: "assets/images/produto-05.svg",
    inStock: true,
    featured: true,
  },
  {
    id: 6,
    name: "Moletom Heritage",
    description: "Felpa macia por dentro, modelagem relaxada e presença casual premium.",
    price: 249.9,
    sizes: ["P", "M", "G", "GG"],
    image: "assets/images/produto-06.svg",
    inStock: true,
    featured: false,
  },
  {
    id: 7,
    name: "Tricô Fino",
    description: "Fio fino e confortável, ideal para sobreposições e noites mais frescas.",
    price: 219.9,
    sizes: ["M", "G", "GG"],
    image: "assets/images/produto-07.svg",
    inStock: true,
    featured: false,
  },
  {
    id: 8,
    name: "Camisa Casual Linho",
    description: "Mistura de linho com caimento solto e textura natural.",
    price: 199.9,
    sizes: ["P", "M", "G", "GG"],
    image: "assets/images/produto-08.svg",
    inStock: true,
    featured: false,
  },
  {
    id: 9,
    name: "Calça Jeans Dark",
    description: "Denim escuro com elastano, corte reto e lavagem sofisticada.",
    price: 269.9,
    sizes: ["38", "40", "42", "44", "46"],
    image: "assets/images/produto-09.svg",
    inStock: true,
    featured: false,
  },
  {
    id: 10,
    name: "Jaqueta Signature",
    description: "Peça de destaque com acabamento refinado para fechar o look.",
    price: 389.9,
    sizes: ["P", "M", "G"],
    image: "assets/images/produto-10.svg",
    inStock: false,
    featured: true,
  },
];
