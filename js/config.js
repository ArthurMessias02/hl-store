/**
 * CONFIGURAÇÃO CENTRAL DA HL STORE
 * ------------------------------------------------------------
 * Altere aqui os dados de contato e da marca.
 * Tudo marcado com "DEMO" precisa ser substituído antes de publicar.
 */
window.HL_CONFIG = {
  // Exemplo de formato: "5511999999999"
  whatsappNumber: "5515988250486",

  // DEMO: substitua pelo perfil real da loja.
  instagramUrl: "https://www.instagram.com/userhlstore/",

  // O texto sob as letras HL ("STORE" ou "STORIES") agora fica dentro do SVG
  // da logo no index.html (procure por class="logo-svg__name").
  brandName: "HL Store",

  // Quantidade de produtos exibidos antes do botão "VER MAIS PEÇAS".
  initialVisible: 5,

  // Mensagem enviada pelos botões gerais de WhatsApp (sem produto específico).
  generalMessage:
    "Olá! Vim pelo site da HL Store e gostaria de consultar tamanhos e disponibilidade das peças.",

  // ---------- CARRINHO ----------
  // Máximo de unidades da mesma peça/tamanho.
  cartMaxPerItem: 10,

  // Máximo de linhas diferentes (peça + tamanho) por pedido.
  cartMaxLines: 20,

  // Primeira linha da mensagem do pedido enviada ao WhatsApp.
  cartWhatsappIntro: "Olá! Gostaria de fazer um pedido na HL Store:",

  // Última linha da mensagem do pedido.
  cartWhatsappOutro: "Aguardo a confirmação de disponibilidade e a forma de pagamento.",

  // ---------- CUPOM DE BOAS-VINDAS ----------
  // Código mostrado no popup de cadastro. PRECISA ser igual ao cupom criado no banco
  // (db/coupons.sql cria o BEMVINDO10). Quem valida o cupom é o banco, não este valor.
  welcomeCouponCode: "BEMVINDO10",

  // ---------- BANCO DE DADOS (futuro; ainda não usado) ----------
  // Só valores PÚBLICOS. Preencha na etapa de integração com os dados do seu
  // projeto Supabase (Project Settings > API). Nunca coloque aqui a chave
  // "service_role": ela dá acesso total ao banco.
  supabase: {
    url: "https://jrdkcfhfunclkssxpaei.supabase.co",
    // chave "anon" PÚBLICA (a segurança vem das regras RLS do banco). Nunca coloque aqui a service_role.
    anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZGtjZmhmdW5jbGtzc3hwYWVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0NTA5MTgsImV4cCI6MjEwODAyNjkxOH0.jWcWDPtwKeFDLBp3JvAyZhu_ZdBY4RRmDxmp23wNt-k",
  },
};
