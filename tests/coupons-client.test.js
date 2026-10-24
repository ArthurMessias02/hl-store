/* Testes do cliente de cupons (js/coupons.js) e da mensagem do carrinho (js/cart.js).
   Rodar: node tests/coupons-client.test.js
   O cálculo do desconto NÃO é testado aqui: ele mora no banco (tests/run-sql-tests.sh). */
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
let n = 0;
function ok(name) { n++; console.log("ok  - " + name); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freshEnv(fetchImpl, cartLines) {
  const store = {};
  const g = globalThis;
  for (const k of ["HLCoupons", "HLCart", "HLPromo"]) delete g[k];
  g.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  g.HL_CONFIG = { supabase: { url: "https://x.supabase.co", anonKey: "eyJabc" }, whatsappNumber: "5500", cartWhatsappIntro: "Olá", cartWhatsappOutro: "Obrigado", welcomeCouponCode: "BEMVINDO10" };
  const subs = [];
  let lines = cartLines;
  g.HLCart = { lines: () => lines, totalCents: () => lines.reduce((s, l) => s + l.unitCents * l.qty, 0), subscribe: (fn) => subs.push(fn) };
  g.fetch = fetchImpl;
  delete require.cache[require.resolve("../js/coupons.js")];
  require("../js/coupons.js");
  return { store, setLines: (l) => { lines = l; subs.forEach((f) => f()); } };
}
const L = (id, qty, unit) => ({ id, qty, unitCents: unit });
const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const good = (sub, disc) => ({ ok: true, code: "BEMVINDO10", discount_type: "percent", discount_value: 10, subtotal_cents: sub, discount_cents: disc, total_cents: sub - disc });

(async () => {
  // ---- normalização do código
  freshEnv(() => json({}), []);
  const C = globalThis.HLCoupons;
  assert.strictEqual(C.normalizeCode("  bemvindo 10 "), "BEMVINDO10"); ok("normaliza: espaços e maiúsculas");
  assert.strictEqual(C.normalizeCode("ｂｅｍ"), "BEM"); ok("normaliza: caracteres de largura total");
  assert.strictEqual(C.normalizeCode(null), ""); ok("normaliza: null");
  assert.strictEqual(C.normalizeCode("a".repeat(100)).length, 32); ok("normaliza: limita a 32 caracteres");

  // ---- aplicar com sucesso; envia só id e qty (nunca preço)
  let calls = [];
  let env = freshEnv((url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return json(good(8999, 900)); }, [L(1, 1, 8999)]);
  await globalThis.HLCoupons.apply("bemvindo10");
  assert.strictEqual(calls[0].url, "https://x.supabase.co/rest/v1/rpc/validate_coupon");
  assert.deepStrictEqual(calls[0].body, { p_code: "BEMVINDO10", p_items: [{ id: 1, qty: 1 }] }); ok("envia só { id, qty } ao banco (sem preço)");
  assert.strictEqual(HLCoupons.state.status, "applied");
  assert.strictEqual(HLCoupons.discountCents(), 900); ok("aplicado: desconto vem do banco");
  assert.strictEqual(env.store["hl-store-coupon"], "BEMVINDO10"); ok("guarda só o código (nada sensível)");

  // ---- recusado
  env = freshEnv(() => json({ ok: false, reason: "expired", message: "Este cupom expirou." }), [L(1, 1, 8999)]);
  await HLCoupons.apply("OLD");
  assert.strictEqual(HLCoupons.state.status, "invalid"); assert.strictEqual(HLCoupons.state.message, "Este cupom expirou.");
  assert.strictEqual(HLCoupons.discountCents(), 0); ok("recusado: mensagem do banco e desconto 0");
  assert.strictEqual(env.store["hl-store-coupon"], undefined); ok("recusado por motivo fixo: código não é lembrado");

  env = freshEnv(() => json({ ok: false, reason: "min_purchase", message: "Mínimo R$ 300,00." }), [L(1, 1, 8999)]);
  await HLCoupons.apply("MIN300");
  assert.strictEqual(env.store["hl-store-coupon"], undefined); ok("mínimo não atingido: não grava código inválido");

  // ---- sem itens / sem código
  freshEnv(() => { throw new Error("não deveria chamar"); }, []);
  await HLCoupons.apply("X123"); assert.strictEqual(HLCoupons.state.status, "invalid"); ok("carrinho vazio: nem consulta o banco");
  await HLCoupons.apply("   "); assert.ok(/Digite/.test(HLCoupons.state.message)); ok("código vazio: pede o código");

  // ---- falha de rede e HTTP 500
  freshEnv(() => Promise.reject(new Error("offline")), [L(1, 1, 8999)]);
  await HLCoupons.apply("BEMVINDO10"); assert.strictEqual(HLCoupons.state.status, "error"); assert.strictEqual(HLCoupons.discountCents(), 0); ok("sem rede: erro e nenhum desconto");
  freshEnv(() => json({}, 500), [L(1, 1, 8999)]);
  await HLCoupons.apply("BEMVINDO10"); assert.strictEqual(HLCoupons.state.status, "error"); ok("HTTP 500: erro e nenhum desconto");
  freshEnv(() => json("lixo"), [L(1, 1, 8999)]);
  await HLCoupons.apply("BEMVINDO10"); assert.strictEqual(HLCoupons.state.status, "error"); ok("resposta inesperada não vira desconto");

  // ---- subtotal do banco diferente do da tela: não mostra total que não bate
  freshEnv(() => json(good(9999, 1000)), [L(1, 1, 8999)]);
  await HLCoupons.apply("BEMVINDO10");
  assert.strictEqual(HLCoupons.state.status, "error"); assert.strictEqual(HLCoupons.discountCents(), 0);
  assert.ok(/Recarregue/.test(HLCoupons.state.message)); ok("preços divergentes: sem desconto e pede para recarregar");

  // ---- carrinho muda: revalida e nunca usa desconto antigo
  calls = [];
  env = freshEnv((url, opts) => { const b = JSON.parse(opts.body); calls.push(b); const sub = b.p_items.reduce((s, i) => s + i.qty * 8999, 0); return json(good(sub, Math.round(sub / 10))); }, [L(1, 1, 8999)]);
  await HLCoupons.apply("BEMVINDO10");
  env.setLines([L(1, 2, 8999)]);
  assert.strictEqual(HLCoupons.state.status, "checking"); assert.strictEqual(HLCoupons.discountCents(), 0); ok("carrinho mudou: desconto antigo some na hora");
  await sleep(400);
  assert.strictEqual(HLCoupons.state.status, "applied"); assert.strictEqual(HLCoupons.discountCents(), 1800); assert.strictEqual(calls.length, 2); ok("carrinho mudou: revalida e aplica uma única vez (1800)");
  env.setLines([L(1, 3, 8999)]); env.setLines([L(1, 4, 8999)]); await sleep(450);
  assert.strictEqual(calls.length, 3); ok("várias mudanças seguidas = 1 consulta (debounce)");
  env.setLines([]); assert.strictEqual(HLCoupons.state.status, "idle"); assert.strictEqual(env.store["hl-store-coupon"], undefined); ok("carrinho esvaziado: cupom removido");

  // ---- resposta antiga não sobrescreve a nova
  let resolvers = [];
  env = freshEnv(() => new Promise((r) => resolvers.push(r)), [L(1, 1, 8999)]);
  const p1 = HLCoupons.apply("PRIMEIRO"); const p2 = HLCoupons.apply("SEGUNDO");
  resolvers[1]({ ok: true, json: () => Promise.resolve(good(8999, 900)) });
  resolvers[0]({ ok: true, json: () => Promise.resolve({ ok: false, reason: "inactive", message: "antigo" }) });
  await Promise.all([p1, p2]);
  assert.strictEqual(HLCoupons.state.status, "applied"); assert.strictEqual(HLCoupons.state.code, "SEGUNDO"); ok("resposta atrasada de uma consulta antiga é descartada");

  // ---- reserva
  calls = [];
  env = freshEnv((url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return json(Object.assign(good(8999, 900), { order_ref: "HL-ABC234" })); }, [L(1, 1, 8999)]);
  await HLCoupons.apply("BEMVINDO10");
  const r = await HLCoupons.reserve();
  assert.ok(r.ok && r.orderRef === "HL-ABC234" && r.discountCents === 900);
  assert.ok(calls[1].url.endsWith("/rpc/reserve_coupon") && /^[0-9a-f-]{36}$/.test(calls[1].body.p_client_id)); ok("reservar: chama reserve_coupon com identificador anônimo");
  const id1 = calls[1].body.p_client_id; await HLCoupons.reserve();
  assert.strictEqual(calls[2].body.p_client_id, id1); ok("o identificador anônimo é estável entre cliques");

  env = freshEnv(() => json({ ok: false, reason: "exhausted", message: "Este cupom esgotou." }), [L(1, 1, 8999)]);
  HLCoupons.state.code = "X"; HLCoupons.state.status = "applied";
  const bad = await HLCoupons.reserve();
  assert.ok(!bad.ok && bad.message === "Este cupom esgotou." && HLCoupons.state.status === "invalid"); ok("reservar recusado: não gera link e o estado vira inválido");
  env = freshEnv(() => Promise.reject(new Error("offline")), [L(1, 1, 8999)]);
  HLCoupons.state.code = "X";
  const net = await HLCoupons.reserve(); assert.ok(!net.ok && net.network); ok("reservar sem rede: falha explícita (nunca segue com desconto não confirmado)");

  // ---- sem Supabase configurado
  const g = globalThis; g.HL_CONFIG = { supabase: {} }; delete require.cache[require.resolve("../js/coupons.js")]; require("../js/coupons.js");
  assert.strictEqual(HLCoupons.enabled, false); await HLCoupons.apply("BEMVINDO10"); assert.strictEqual(HLCoupons.discountCents(), 0); ok("sem banco configurado: cupons desativados, nunca desconto local");

  // ---- mensagem do WhatsApp (cart.js)
  for (const k of ["HLCoupons", "HLCart"]) delete g[k];
  g.HL_CONFIG = { whatsappNumber: "5515", cartWhatsappIntro: "Olá!", cartWhatsappOutro: "Aguardo." };
  g.HL_PRODUCTS = [{ id: 1, name: "Camiseta", price: 89.99, sizes: ["M"], inStock: true, image: "a.webp" }];
  g.HLPromo = { current: (p) => ({ currentCents: Math.round(p.price * 100) }) };
  g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  delete require.cache[require.resolve("../js/cart.js")]; require("../js/cart.js");
  HLCart.add(1, "M"); HLCart.add(1, "M");
  const plain = HLCart.message();
  assert.ok(plain.includes("Total: R$ 179,98") && !plain.includes("Cupom")); ok("mensagem sem cupom: igual à de antes");
  const withC = HLCart.message({ couponCode: "BEMVINDO10", discountCents: 1800, orderRef: "HL-ABC234" });
  assert.ok(withC.includes("Subtotal: R$ 179,98") && withC.includes("Cupom BEMVINDO10: -R$ 18,00") && withC.includes("Total: R$ 161,98") && withC.includes("Pedido: HL-ABC234")); ok("mensagem com cupom: subtotal, desconto, total e pedido");
  const huge = HLCart.message({ couponCode: "X", discountCents: 99999999, orderRef: "HL-1" });
  assert.ok(huge.includes("Total: R$ 0,00")); ok("desconto nunca deixa o total negativo na mensagem");
  assert.ok(!HLCart.message({ couponCode: "X", discountCents: 0 }).includes("Cupom")); ok("desconto zero não imprime linha de cupom");

  // ---- consistência do cupom de boas-vindas
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  assert.ok(/welcomeCouponCode:\s*"BEMVINDO10"/.test(read("js/config.js")));
  assert.ok(/class="lead-coupon-code">BEMVINDO10</.test(read("index.html")));
  assert.ok(/values \('BEMVINDO10'[\s\S]*?'percent', 10,/.test(read("db/coupons.sql")));
  assert.ok(!/Apresente este código/.test(read("index.html") + read("js/customer-popup.js"))); ok("BEMVINDO10: igual em config, popup e migração (10% percentual)");

  // ---- nenhuma chave privilegiada no front-end
  const front = ["js/config.js", "js/coupons.js", "js/cart.js", "js/cart-ui.js", "admin/js/client.js", "admin/js/coupons.js"].map(read).join("\n");
  assert.ok(!/service_role["']?\s*[:=]\s*["']ey/i.test(front));
  const m = read("js/config.js").match(/anonKey:\s*"([^"]+)"/);
  const payload = JSON.parse(Buffer.from(m[1].split(".")[1], "base64").toString());
  assert.strictEqual(payload.role, "anon"); ok("front-end só tem a chave pública (role = anon)");

  console.log("\n" + n + " verificações passaram");
})().catch((e) => { console.error("FALHOU:", e); process.exit(1); });
