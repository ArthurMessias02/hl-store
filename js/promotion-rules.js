/**
 * HL Store — REGRA ÚNICA DE PROMOÇÃO (window.HLPromo)
 * ------------------------------------------------------------
 * Toda tela que mostra ou cobra preço (seção de ofertas, card do catálogo,
 * página do produto, carrinho, mensagem do WhatsApp) deve perguntar a este
 * módulo qual é o preço atual. Assim não existe mais "uma regra por tela".
 *
 * Sem dependências, sem acesso à rede (exceto fetchPromotions, que é opcional)
 * e sem DOM: funciona no navegador e no Node (para testes).
 *
 * Uma promoção só vale quando TODAS as condições são verdadeiras:
 *  1. o registro existe;
 *  2. is_active é exatamente true (null, undefined, "true", 1 NÃO valem);
 *  3. o produto associado existe;
 *  4. promo_price é um número finito > 0;
 *  5. promo_price < preço normal (comparado em centavos);
 *  6. starts_at, se existir, já passou;
 *  7. ends_at, se existir, ainda não passou.
 * Data nula = sem limite naquele lado. Data preenchida mas ilegível = promoção
 * INVÁLIDA (na dúvida, não damos desconto).
 *
 * Várias promoções válidas para o mesmo produto (o schema.sql impede, mas um
 * banco antigo pode ter): vence a de MENOR sort_order; empate -> a criada por
 * último (created_at); novo empate -> a de menor id (ordem alfabética).
 * Nunca se escolhe "a que aparecer primeiro" ou "o menor preço" por acaso.
 */
(function (root) {
  "use strict";

  /* ---------- utilitários ---------- */
  function toCents(v) { return Math.round(Number(v) * 100); }

  /** Aceita "AAAA-MM-DD" (dia local; fim = 23:59:59.999) ou timestamp ISO com fuso (timestamptz). */
  function parseTime(value, isEnd) {
    if (value === null || value === undefined || value === "") return { ok: true, t: null };
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      var p = String(value).split("-").map(Number);
      var d = isEnd ? new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999) : new Date(p[0], p[1] - 1, p[2]);
      return isNaN(d.getTime()) ? { ok: false, t: null } : { ok: true, t: d.getTime() };
    }
    var t = Date.parse(value);
    return isNaN(t) ? { ok: false, t: null } : { ok: true, t: t };
  }

  /* ---------- normalização ---------- */
  /**
   * Converte uma linha da tabela public.promotions para o formato interno.
   * byUuid: { [products.id uuid]: id usado pela vitrine (products.public_id) }
   */
  function fromRow(row, byUuid) {
    return {
      id: row.id,
      productId: byUuid ? byUuid[row.product_id] : row.product_id,
      promoPrice: row.promo_price,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    };
  }

  /* ---------- validação de UMA promoção ---------- */
  /** Devolve { valid: boolean, reason: string|null }. now = timestamp em ms (padrão: agora). */
  function check(promo, product, now) {
    if (!promo) return { valid: false, reason: "sem-registro" };
    if (promo.isActive !== true) return { valid: false, reason: "inativa" };
    if (!product) return { valid: false, reason: "produto-inexistente" };
    var pp = Number(promo.promoPrice);
    if (promo.promoPrice === null || promo.promoPrice === "" || !isFinite(pp) || pp <= 0) {
      return { valid: false, reason: "preco-invalido" };
    }
    var base = Number(product.price);
    if (!isFinite(base) || base <= 0) return { valid: false, reason: "preco-normal-invalido" };
    if (toCents(pp) >= toCents(base)) return { valid: false, reason: "preco-nao-menor" };
    var t = typeof now === "number" ? now : Date.now();
    var s = parseTime(promo.startsAt, false), e = parseTime(promo.endsAt, true);
    if (!s.ok || !e.ok) return { valid: false, reason: "data-ilegivel" };
    if (s.t !== null && t < s.t) return { valid: false, reason: "nao-iniciada" };
    if (e.t !== null && t > e.t) return { valid: false, reason: "expirada" };
    return { valid: true, reason: null };
  }

  function byPriority(a, b) {
    var sa = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : 0;
    var sb = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;
    if (sa !== sb) return sa - sb;
    var ca = Date.parse(a.createdAt) || 0, cb = Date.parse(b.createdAt) || 0;
    if (ca !== cb) return cb - ca;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  }

  /* ---------- resolução para o catálogo inteiro ---------- */
  /**
   * Devolve um "mapa" { [String(productId)]: promoção válida } com no máximo UMA
   * promoção por produto. Esta é a ÚNICA fonte de verdade da loja.
   * options.now: ms (para testes). options.onConflict(productId, vencedora, descartadas).
   */
  function resolve(promotions, products, options) {
    options = options || {};
    var now = typeof options.now === "number" ? options.now : Date.now();
    var prodById = {};
    (products || []).forEach(function (p) { prodById[String(p.id)] = p; });

    var candidates = {};
    (Array.isArray(promotions) ? promotions : []).forEach(function (promo) {
      if (!promo || promo.productId === undefined || promo.productId === null) return;
      var key = String(promo.productId);
      if (check(promo, prodById[key], now).valid) (candidates[key] = candidates[key] || []).push(promo);
    });

    var out = {};
    Object.keys(candidates).forEach(function (key) {
      var list = candidates[key].slice().sort(byPriority);
      out[key] = list[0];
      if (list.length > 1 && typeof options.onConflict === "function") options.onConflict(key, list[0], list.slice(1));
    });
    return out;
  }

  /* ---------- preço efetivo (usar em TODAS as telas) ---------- */
  /**
   * info = { original, current, originalCents, currentCents, onSale, discountPct, promo }
   * Sem promoção válida: current === original e onSale === false (sem selo, sem preço riscado).
   */
  function priceInfo(product, resolved) {
    var original = Number(product.price);
    var promo = resolved ? resolved[String(product.id)] : null;
    if (promo) {
      var cur = Number(promo.promoPrice);
      return {
        original: original, current: cur,
        originalCents: toCents(original), currentCents: toCents(cur),
        onSale: true,
        discountPct: Math.round((1 - toCents(cur) / toCents(original)) * 100),
        promo: promo,
      };
    }
    return {
      original: original, current: original,
      originalCents: toCents(original), currentCents: toCents(original),
      onSale: false, discountPct: 0, promo: null,
    };
  }

  /* ---------- estado compartilhado no navegador ---------- */
  var state = { promos: [], products: [], options: {}, loaded: false, error: null };

  /** Chamado uma vez pelo store-data.js depois de buscar produtos e promoções. */
  function setData(promotions, products, options) {
    state.promos = Array.isArray(promotions) ? promotions : [];
    state.products = products || [];
    state.options = options || {};
    state.loaded = true;
    state.error = null;
    return resolved();
  }

  /** Falha ao carregar promoções: NENHUM desconto (nunca preço fictício). */
  function setError(err) {
    state.promos = [];
    state.loaded = true;
    state.error = err || new Error("promotions-unavailable");
  }

  /* A validade é recalculada A CADA CONSULTA (com a hora atual): uma promoção que expira
     com a página aberta deixa de valer no carrinho e na mensagem do WhatsApp sem recarregar. */
  function resolved() { return resolve(state.promos, state.products, state.options); }

  function current(product) { return priceInfo(product, resolved()); }

  /* ---------- busca no Supabase (opcional; só chave pública) ---------- */
  var COLUMNS = "id,product_id,promo_price,starts_at,ends_at,is_active,sort_order,created_at";

  /**
   * Busca promoções com TODAS as colunas que a regra precisa. Nunca lança:
   * devolve { ok:false, rows:[], error } em qualquer falha (HTTP, rede, JSON, timeout).
   * Não filtra nada: a decisão de validade é de check()/resolve(), para ficar numa regra só.
   */
  function fetchPromotions(baseUrl, headers, signal) {
    var url = String(baseUrl).replace(/\/+$/, "") + "/rest/v1/promotions?select=" + COLUMNS +
      "&order=sort_order.asc,created_at.desc";
    return fetch(url, { headers: headers, signal: signal }).then(function (res) {
      if (!res.ok) throw new Error("promotions: HTTP " + res.status);
      return res.json();
    }).then(function (rows) {
      if (!Array.isArray(rows)) throw new Error("promotions: resposta inesperada");
      return { ok: true, rows: rows, error: null };
    }).catch(function (err) {
      return { ok: false, rows: [], error: err };
    });
  }

  root.HLPromo = {
    check: check,
    resolve: resolve,
    priceInfo: priceInfo,
    fromRow: fromRow,
    setData: setData,
    setError: setError,
    current: current,
    fetchPromotions: fetchPromotions,
    get loaded() { return state.loaded; },
    get error() { return state.error; },
    get resolved() { return resolved(); },
  };
})(typeof window !== "undefined" ? window : globalThis);
