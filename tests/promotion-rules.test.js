/* Testes do módulo js/promotion-rules.js. Rodar: node tests/promotion-rules.test.js */
"use strict";
const assert = require("assert");
require("../js/promotion-rules.js");
const P = globalThis.HLPromo;

const NOW = Date.parse("2026-10-22T22:00:00Z"); // data fixa => teste determinístico
const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();

const shorts = { id: 6, name: "Shorts Diesel", price: 95.99, sizes: ["M"], inStock: true };
const camisa = { id: 1, name: "Camiseta Tommy", price: 89.99, sizes: ["M"], inStock: true };
const products = [shorts, camisa];
const base = { id: "a", productId: 6, promoPrice: 65.99, isActive: true, sortOrder: 0, createdAt: iso(NOW - DAY) };

let passed = 0;
function t(name, fn) { fn(); passed++; console.log("ok  -", name); }
const price = (promos, p, opts) => P.priceInfo(p, P.resolve(promos, products, Object.assign({ now: NOW }, opts)));

t("1. produto sem registro de promoção: só preço normal, sem selo", () => {
  const i = price([], shorts);
  assert.strictEqual(i.onSale, false); assert.strictEqual(i.current, 95.99); assert.strictEqual(i.discountPct, 0);
});
t("2. promoção ativa e válida: 95,99 -> 65,99 com selo", () => {
  const i = price([base], shorts);
  assert.strictEqual(i.onSale, true); assert.strictEqual(i.current, 65.99); assert.strictEqual(i.original, 95.99); assert.strictEqual(i.discountPct, 31);
});
t("3. promoção inativa (false) não vale", () => {
  assert.strictEqual(price([{ ...base, isActive: false }], shorts).onSale, false);
});
t("3b. is_active só vale se for exatamente true (null/undefined/'true'/1 não valem)", () => {
  [null, undefined, "true", 1, "t"].forEach((v) => assert.strictEqual(price([{ ...base, isActive: v }], shorts).onSale, false, String(v)));
});
t("4. promoção ainda não iniciada não vale", () => {
  assert.strictEqual(price([{ ...base, startsAt: iso(NOW + DAY) }], shorts).onSale, false);
});
t("5. promoção expirada não vale", () => {
  assert.strictEqual(price([{ ...base, endsAt: iso(NOW - 1) }], shorts).onSale, false);
});
t("5b. datas nulas = sem limite; dentro do intervalo vale; fuso é respeitado", () => {
  assert.strictEqual(price([{ ...base, startsAt: null, endsAt: null }], shorts).onSale, true);
  assert.strictEqual(price([{ ...base, startsAt: iso(NOW - DAY), endsAt: iso(NOW + DAY) }], shorts).onSale, true);
  // 22:00Z == 19:00-03:00: termina 1 min depois (vale) / 1 min antes (não vale)
  assert.strictEqual(price([{ ...base, endsAt: "2026-10-22T19:01:00-03:00" }], shorts).onSale, true);
  assert.strictEqual(price([{ ...base, endsAt: "2026-10-22T18:59:00-03:00" }], shorts).onSale, false);
});
t("5c. data preenchida porém ilegível = promoção inválida (não dá desconto)", () => {
  assert.strictEqual(price([{ ...base, endsAt: "lixo" }], shorts).onSale, false);
});
t("6. preço promocional igual ou maior que o normal não vale", () => {
  assert.strictEqual(price([{ ...base, promoPrice: 95.99 }], shorts).onSale, false);
  assert.strictEqual(price([{ ...base, promoPrice: 120 }], shorts).onSale, false);
});
t("6b. preço promocional inválido (0, negativo, NaN, null, '') não vale; string numérica do banco vale", () => {
  [0, -5, NaN, null, "", "abc"].forEach((v) => assert.strictEqual(price([{ ...base, promoPrice: v }], shorts).onSale, false, String(v)));
  assert.strictEqual(price([{ ...base, promoPrice: "65.99" }], shorts).onSale, true);
});
t("6c. produto inexistente: promoção ignorada, sem erro", () => {
  assert.deepStrictEqual(P.resolve([{ ...base, productId: 999 }], products, { now: NOW }), {});
});
t("duplicadas: vence menor sort_order; empate -> criada por último; resultado estável", () => {
  const a = { ...base, id: "a", promoPrice: 70, sortOrder: 2 };
  const b = { ...base, id: "b", promoPrice: 65.99, sortOrder: 1 };
  const c = { ...base, id: "c", promoPrice: 60, sortOrder: 1, createdAt: iso(NOW - 2 * DAY) };
  let conflict = null;
  const r = P.resolve([a, c, b], products, { now: NOW, onConflict: (k, w, d) => { conflict = { k, w, d }; } });
  assert.strictEqual(r["6"].id, "b"); // sort_order 1 e mais recente
  assert.strictEqual(conflict.d.length, 2);
  assert.strictEqual(P.resolve([b, c, a], products, { now: NOW })["6"].id, "b"); // ordem de entrada não importa
});
t("duplicadas: inválida de maior prioridade é ignorada, a válida seguinte vence", () => {
  const inativa = { ...base, id: "i", isActive: false, sortOrder: 0 };
  const boa = { ...base, id: "ok", promoPrice: 70, sortOrder: 5 };
  assert.strictEqual(price([inativa, boa], shorts).current, 70);
});
t("8. fromRow: promoção do banco (uuid) liga ao produto certo (mesmo id do card/href)", () => {
  const byUuid = { "uuid-shorts": 6, "uuid-camisa": 1 };
  const promos = [
    P.fromRow({ id: "r1", product_id: "uuid-shorts", promo_price: "65.99", starts_at: null, ends_at: null, is_active: true, sort_order: 0, created_at: iso(NOW - DAY) }, byUuid),
    P.fromRow({ id: "r2", product_id: "uuid-camisa", promo_price: "70.00", starts_at: null, ends_at: null, is_active: false, sort_order: 1, created_at: iso(NOW - DAY) }, byUuid),
  ];
  const r = P.resolve(promos, products, { now: NOW });
  assert.deepStrictEqual(Object.keys(r), ["6"]);
  assert.strictEqual(P.priceInfo(camisa, r).onSale, false);
});
t("9. consistência card x página x carrinho x WhatsApp (mesmos centavos)", () => {
  const r = P.resolve([base], products, { now: NOW });
  const card = P.priceInfo(shorts, r), page = P.priceInfo(shorts, r);
  const cartCents = P.priceInfo(shorts, r).currentCents * 2;
  assert.strictEqual(card.current, page.current);
  assert.strictEqual(cartCents, 13198); // 2 x 65,99
  const sem = P.priceInfo(shorts, P.resolve([], products, { now: NOW }));
  assert.strictEqual(sem.currentCents * 2, 19198); // 2 x 95,99
});
t("Shorts Diesel: R$ 65,99 NÃO aparece sem promoção válida (cada motivo)", () => {
  const casos = [[], [{ ...base, isActive: false }], [{ ...base, endsAt: iso(NOW - 1) }], [{ ...base, startsAt: iso(NOW + DAY) }], [{ ...base, isActive: undefined }]];
  casos.forEach((c) => { const i = price(c, shorts); assert.strictEqual(i.current, 95.99); assert.strictEqual(i.onSale, false); });
});
t("centavos: sem erro de ponto flutuante (89,99 vs 89,99 não é desconto)", () => {
  assert.strictEqual(price([{ ...base, productId: 1, promoPrice: 89.99 }], camisa).onSale, false);
  assert.strictEqual(price([{ ...base, productId: 1, promoPrice: 89.98 }], camisa).onSale, true);
});

(async () => {
  const hdr = { apikey: "x" };
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  let r = await P.fetchPromotions("https://x.supabase.co/", hdr);
  assert.strictEqual(r.ok, false); assert.deepStrictEqual(r.rows, []);
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  r = await P.fetchPromotions("https://x.supabase.co", hdr);
  assert.strictEqual(r.ok, false);
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ message: "erro" }) });
  r = await P.fetchPromotions("https://x.supabase.co", hdr);
  assert.strictEqual(r.ok, false);
  // a consulta pede TODAS as colunas da regra
  let url = "";
  globalThis.fetch = async (u) => { url = u; return { ok: true, json: async () => [] }; };
  await P.fetchPromotions("https://x.supabase.co", hdr);
  ["is_active", "promo_price", "starts_at", "ends_at", "sort_order", "created_at", "product_id"].forEach((c) => assert.ok(url.includes(c), c));
  P.setData([base], products, { now: NOW });
  assert.strictEqual(P.current(shorts).onSale, true);
  P.setError(new Error("falhou"));
  assert.strictEqual(P.current(shorts).onSale, false); assert.strictEqual(P.current(shorts).current, 95.99);
  assert.ok(P.error);
  passed++; console.log("ok  - 7. falha na consulta -> sem desconto (HTTP 500, rede, JSON inesperado, colunas pedidas)");

  console.log("\n" + passed + " grupos de testes passaram");
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
