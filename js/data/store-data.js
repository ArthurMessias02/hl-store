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
    content: {},
  };

  /* Modo local (sem Supabase): promoções de js/promotions.js passam pela MESMA regra.
     Cada item precisa de { productId, promoPrice, isActive: true, startsAt?, endsAt? }. */
  if (!configured) HLPromo.setData(window.HL_PROMOTIONS || [], state.products);

  /* Identificador do produto na vitrine (carrinho, #produto-N, promoções).
     Normalmente é products.public_id; produtos cadastrados sem esse número
     (public_id nulo no banco) usam o uuid, para não ficarem sem identificador. */
  function publicId(p) {
    return p.public_id !== null && p.public_id !== undefined ? p.public_id : p.id;
  }

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
      HLPromo.fetchPromotions(BASE, headers(), ctl.signal), // nunca lança: { ok, rows, error }
      get("site_content", "select=key,value", ctl.signal),
    ]).then(function (r) {
      clearTimeout(timer);
      const photos = {};
      r[1].forEach(function (im) { (photos[im.product_id] = photos[im.product_id] || []).push(imageUrl(im.path)); });

      const products = r[0].map(function (p) {
        const imgs = photos[p.id] || [];
        return {
          id: publicId(p),
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
      r[0].forEach(function (p) { byUuid[p.id] = publicId(p); });

      /* Validação de promoções num lugar só: js/promotion-rules.js (HLPromo).
         Falha ao carregar promoções = nenhum desconto (nunca preço fictício). */
      if (r[2].ok) {
        HLPromo.setData(r[2].rows.map(function (row) { return HLPromo.fromRow(row, byUuid); }), products, {
          onConflict: function (id) { console.warn("HL Store: mais de uma promoção válida para o produto " + id + "; vale a de menor sort_order."); },
        });
      } else {
        console.warn("HL Store: promoções indisponíveis, sem descontos.", r[2].error);
        HLPromo.setError(r[2].error);
      }

      const content = {};
      r[3].forEach(function (c) { content[c.key] = c.value; });

      state.products = products; state.content = content;
      /* O carrinho (js/cart.js) e a vitrine leem window.HL_PRODUCTS */
      window.HL_PRODUCTS = products;
    }).catch(function (err) {
      clearTimeout(timer);
      console.warn("HL Store: banco indisponível, usando cópia local dos produtos.", err);
      state.source = "local-fallback";
      HLPromo.setError(err);
    });
  }

  const ready = configured ? load() : Promise.resolve();

  return {
    ready: ready,
    get source() { return state.source; },
    getProducts: function () { return state.products; },
    getPromotions: function () { return HLPromo.resolved; }, // { [productId]: promoção válida }
    getSiteContent: function () { return state.content; }, // textos editáveis: ainda não usados pela vitrine
  };
})();
