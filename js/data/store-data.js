/**
 * CAMADA DE ACESSO AOS DADOS DA VITRINE (HL_DATA)
 * ------------------------------------------------------------
 * A loja lê produtos e promoções por aqui, e não direto dos arquivos.
 *
 * Duas fontes possíveis:
 *  - "supabase": quando js/config.js tem supabase.url e supabase.anonKey. Busca no
 *    banco (somente LEITURA pública; as regras RLS do banco só entregam o que
 *    está publicado e as promoções ativas e dentro do prazo).
 *  - "local": sem Supabase configurado, usa js/products.js e js/promotions.js
 *    (modo de desenvolvimento/demonstração).
 *
 * Se o banco estiver configurado mas FALHAR (internet, serviço fora do ar):
 *  - produtos: usa js/products.js como cópia de segurança (a loja não fica vazia);
 *  - promoções: NENHUMA (nunca mostramos ofertas de demonstração como se fossem reais).
 *
 * Este arquivo só LÊ com a chave pública "anon". NUNCA coloque aqui senhas nem a
 * chave service_role: ele vai para o navegador de todos os visitantes.
 *
 * Formato entregue à loja (igual ao que js/products.js sempre teve):
 *  produto  { id, name, description, price, sizes[], image, images[], inStock, featured }
 *  promoção { productId, promoPrice, startsAt?, endsAt? }
 * (id = products.public_id no banco; imagens = products.product_images ordenadas)
 */
window.HL_DATA = (function () {
  "use strict";

  const CFG = (window.HL_CONFIG && window.HL_CONFIG.supabase) || {};
  const configured = !!(CFG.url && CFG.anonKey);
  const BASE = String(CFG.url || "").replace(/\/+$/, "");
  const TIMEOUT_MS = 6000;

  const state = {
    source: configured ? "supabase" : "local",
    products: window.HL_PRODUCTS || [],
    promotions: window.HL_PROMOTIONS || [],
    content: {},
  };

  /* Foto: caminho local legado (assets/...) ou arquivo no Storage do Supabase */
  function imageUrl(path) {
    if (/^(https?:)?\/\//.test(path) || path.indexOf("assets/") === 0) return path;
    return BASE + "/storage/v1/object/public/product-images/" + path.split("/").map(encodeURIComponent).join("/");
  }

  /* A chave antiga "anon" é um JWT (vai também em Authorization). A nova "sb_publishable_..."
     não é JWT e vai SÓ em apikey. */
  function headers() {
    const h = { apikey: CFG.anonKey };
    if (/^eyJ/.test(CFG.anonKey)) h.Authorization = "Bearer " + CFG.anonKey;
    return h;
  }

  function get(table, query, signal) {
    return fetch(BASE + "/rest/v1/" + table + "?" + query, {
      headers: headers(),
      signal: signal,
    }).then(function (res) {
      if (!res.ok) throw new Error(table + ": HTTP " + res.status);
      return res.json();
    });
  }

  function load() {
    const ctl = new AbortController();
    const timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);

    return Promise.all([
      get("products", "select=*&order=sort_order.asc,created_at.asc", ctl.signal),
      get("product_images", "select=product_id,path,sort_order&order=sort_order.asc", ctl.signal),
      get("promotions", "select=product_id,promo_price,starts_at,ends_at,is_active&order=sort_order.asc,created_at.desc", ctl.signal),
      get("site_content", "select=key,value", ctl.signal),
    ]).then(function (r) {
      clearTimeout(timer);
      const photos = {};
      r[1].forEach(function (im) { (photos[im.product_id] = photos[im.product_id] || []).push(imageUrl(im.path)); });

      const products = r[0].map(function (p) {
        const imgs = photos[p.id] || [];
        return {
          id: p.public_id,
          name: p.name,
          description: p.description,
          price: Number(p.price),
          sizes: p.sizes,
          image: imgs[0] || "",
          images: imgs,
          inStock: p.in_stock,
          featured: p.featured,
        };
      });
      const byUuid = {};
      r[0].forEach(function (p) { byUuid[p.id] = p.public_id; });

      const seen = {};
      const promotions = r[2].filter(function (x) {
        return x.is_active === true && byUuid[x.product_id] !== undefined && !seen[x.product_id] && (seen[x.product_id] = true);
      }).map(function (x) {
        return { productId: byUuid[x.product_id], promoPrice: Number(x.promo_price), startsAt: x.starts_at || undefined, endsAt: x.ends_at || undefined };
      });

      const content = {};
      r[3].forEach(function (c) { content[c.key] = c.value; });

      state.products = products; state.promotions = promotions; state.content = content;
      /* O carrinho (js/cart.js) e a vitrine leem window.HL_PRODUCTS */
      window.HL_PRODUCTS = products;
      window.HL_PROMOTIONS = promotions;
    }).catch(function (err) {
      clearTimeout(timer);
      console.warn("HL Store: banco indisponível, usando cópia local dos produtos.", err);
      state.source = "local-fallback";
      state.promotions = [];
      window.HL_PROMOTIONS = [];
    });
  }

  const ready = configured ? load() : Promise.resolve();

  return {
    ready: ready,
    get source() { return state.source; },
    getProducts: function () { return state.products; },
    getPromotions: function () { return state.promotions; },
    getSiteContent: function () { return state.content; }, // textos editáveis: ainda não usados pela vitrine
  };
})();
