/**
 * HL Store — CARRINHO (estado, localStorage e mensagem do WhatsApp)
 * ------------------------------------------------------------
 * Este arquivo não mexe na tela. A interface está em js/cart-ui.js.
 *
 * Regras importantes:
 *  - O carrinho guarda só { id, size, qty }. Nome, preço e foto vêm SEMPRE de
 *    window.HL_PRODUCTS, então mudar um preço em products.js vale para todos.
 *  - Ao carregar, itens que não existem mais, estão indisponíveis ou têm
 *    tamanho inválido são descartados automaticamente.
 *  - Valores são calculados em centavos para evitar erros de arredondamento.
 */
(function (root) {
  "use strict";

  const CONFIG = root.HL_CONFIG || {};
  const PRODUCTS = root.HL_PRODUCTS || [];

  const STORAGE_KEY = "hl-store-cart";
  const MAX_QTY = Number(CONFIG.cartMaxPerItem) || 10;
  const MAX_LINES = Number(CONFIG.cartMaxLines) || 20;

  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  let items = [];
  const listeners = [];

  /* ---------- Utilitários ---------- */
  function findProduct(id) {
    return PRODUCTS.find(function (p) { return String(p.id) === String(id); });
  }

  function keyOf(id, size) {
    return String(id) + "|" + String(size);
  }

  function toCents(price) {
    return Math.round(Number(price) * 100);
  }

  /** Formata centavos como moeda. plain=true troca o espaço "especial" por um espaço comum. */
  function format(cents, plain) {
    const text = currency.format(cents / 100);
    return plain ? text.replace(/ /g, " ") : text;
  }

  function firstPhoto(p) {
    return p.images && p.images.length ? p.images[0] : p.image;
  }

  /* ---------- Validação ---------- */
  /** Recebe uma lista qualquer e devolve só itens válidos, juntando duplicados. */
  function sanitize(raw) {
    const out = [];
    if (!Array.isArray(raw)) return out;

    raw.forEach(function (it) {
      if (!it || typeof it !== "object") return;
      const p = findProduct(it.id);
      if (!p || !p.inStock) return;
      const size = String(it.size);
      if (!Array.isArray(p.sizes) || p.sizes.indexOf(size) === -1) return;
      const qty = Math.floor(Number(it.qty));
      if (!isFinite(qty) || qty < 1) return;

      const existing = out.find(function (x) { return keyOf(x.id, x.size) === keyOf(p.id, size); });
      if (existing) {
        existing.qty = Math.min(MAX_QTY, existing.qty + qty);
      } else if (out.length < MAX_LINES) {
        out.push({ id: p.id, size: size, qty: Math.min(MAX_QTY, qty) });
      }
    });
    return out;
  }

  /* ---------- Armazenamento (nunca quebra se o navegador bloquear) ---------- */
  function read() {
    try {
      const raw = root.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return sanitize(data && data.items);
    } catch (e) {
      return [];
    }
  }

  function write() {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, items: items }));
    } catch (e) { /* sem armazenamento: o carrinho funciona só nesta visita */ }
  }

  function notify() {
    listeners.slice().forEach(function (fn) { fn(); });
  }

  function commit() {
    write();
    notify();
  }

  /* ---------- Ações ---------- */
  function add(id, size) {
    const p = findProduct(id);
    if (!p) return { ok: false, reason: "unknown" };
    if (!p.inStock) return { ok: false, reason: "out-of-stock" };
    size = String(size);
    if (!Array.isArray(p.sizes) || p.sizes.indexOf(size) === -1) return { ok: false, reason: "size" };

    const existing = items.find(function (x) { return keyOf(x.id, x.size) === keyOf(p.id, size); });
    if (existing) {
      if (existing.qty >= MAX_QTY) return { ok: false, reason: "max-qty", max: MAX_QTY };
      existing.qty += 1;
    } else {
      if (items.length >= MAX_LINES) return { ok: false, reason: "max-lines", max: MAX_LINES };
      items.push({ id: p.id, size: size, qty: 1 });
    }
    commit();
    return { ok: true, product: p, size: size };
  }

  function setQty(id, size, qty) {
    const k = keyOf(id, size);
    const idx = items.findIndex(function (x) { return keyOf(x.id, x.size) === k; });
    if (idx === -1) return { ok: false, reason: "unknown" };
    qty = Math.floor(Number(qty));
    if (!isFinite(qty) || qty < 1) return { ok: false, reason: "min-qty" };
    if (qty > MAX_QTY) return { ok: false, reason: "max-qty", max: MAX_QTY };
    items[idx].qty = qty;
    commit();
    return { ok: true };
  }

  function remove(id, size) {
    const k = keyOf(id, size);
    const before = items.length;
    items = items.filter(function (x) { return keyOf(x.id, x.size) !== k; });
    if (items.length !== before) commit();
  }

  function clear() {
    if (!items.length) return;
    items = [];
    commit();
  }

  /* ---------- Consultas ---------- */
  /** Linhas prontas para exibir: produto, tamanho, quantidade e valores em centavos. */
  function lines() {
    return items.map(function (it) {
      const p = findProduct(it.id);
      const unit = toCents(p.price);
      return {
        key: keyOf(it.id, it.size),
        id: p.id,
        product: p,
        name: p.name,
        size: it.size,
        qty: it.qty,
        image: firstPhoto(p),
        unitCents: unit,
        totalCents: unit * it.qty,
      };
    });
  }

  function count() {
    return items.reduce(function (sum, it) { return sum + it.qty; }, 0);
  }

  function totalCents() {
    return lines().reduce(function (sum, l) { return sum + l.totalCents; }, 0);
  }

  /* ---------- Mensagem do WhatsApp ---------- */
  function message() {
    const intro = CONFIG.cartWhatsappIntro || "Olá! Gostaria de fazer um pedido:";
    const outro = CONFIG.cartWhatsappOutro || "";

    const rows = lines().map(function (l) {
      let row = l.qty + "x " + l.name + " — Tam. " + l.size + " — ";
      row += l.qty > 1
        ? format(l.totalCents, true) + " (" + l.qty + " × " + format(l.unitCents, true) + ")"
        : format(l.unitCents, true);
      return row;
    });

    const parts = [intro, "", rows.join("\n"), "", "Total: " + format(totalCents(), true)];
    if (outro) parts.push("", outro);
    return parts.join("\n");
  }

  function whatsappUrl() {
    return "https://wa.me/" + CONFIG.whatsappNumber + "?text=" + encodeURIComponent(message());
  }

  /* ---------- Eventos ---------- */
  function subscribe(fn) {
    listeners.push(fn);
  }

  /* Mantém várias abas abertas em sincronia */
  if (typeof root.addEventListener === "function") {
    root.addEventListener("storage", function (e) {
      if (e.key === STORAGE_KEY || e.key === null) {
        items = read();
        notify();
      }
    });
  }

  items = read();
  write(); // regrava já limpo (remove itens inválidos que estavam salvos)

  root.HLCart = {
    add: add,
    setQty: setQty,
    remove: remove,
    clear: clear,
    lines: lines,
    count: count,
    totalCents: totalCents,
    message: message,
    whatsappUrl: whatsappUrl,
    format: format,
    subscribe: subscribe,
    maxPerItem: MAX_QTY,
    maxLines: MAX_LINES,
  };
})(typeof window !== "undefined" ? window : globalThis);
