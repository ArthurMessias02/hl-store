/**
 * CUPONS NO PAINEL — HLAdmin.coupons
 * ------------------------------------------------------------
 * Telas: lista (#/cupons), formulário (#/cupons/novo e #/cupons/<id>) e
 * utilizações (#/cupons/usos), onde se CONFIRMA ou CANCELA cada pedido.
 *
 * Segurança: nada aqui "protege" nada. Quem recusa gravação de quem não é
 * administrador é o banco (RLS e funções em db/coupons.sql). Estas validações
 * existem para dar mensagens claras antes de enviar; o banco repete todas.
 */
(function () {
  "use strict";

  const A = window.HLAdmin, U = A.ui, C = A.client, D = A.data;
  const h = U.h;
  function eq(v) { return "eq." + v; }

  const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

  /* =============== DADOS =============== */
  function toNum(row) {
    row.discount_value = Number(row.discount_value);
    row.min_purchase = row.min_purchase === null ? null : Number(row.min_purchase);
    return row;
  }

  async function list() {
    const out = await Promise.all([
      C.rest.select("coupons", { select: "*", order: "created_at.desc" }),
      rpc("admin_coupon_usage", {}),
      C.rest.select("products", { select: "id,name,public_id", order: "sort_order.asc" }),
      D.listCategories(),
    ]);
    const usage = {};
    (out[1] || []).forEach(function (u) { usage[u.coupon_id] = u; });
    const products = {}; out[2].forEach(function (p) { products[p.id] = p; });
    const cats = {}; out[3].forEach(function (c) { cats[c.id] = c; });
    return {
      coupons: out[0].map(toNum).map(function (c) {
        c.usage = usage[c.id] || { confirmed: 0, reserved: 0 };
        c.product = c.product_id ? products[c.product_id] || null : null;
        c.category = c.category_id ? cats[c.category_id] || null : null;
        return c;
      }),
      products: out[2], categories: out[3],
    };
  }

  /* chamada de função do banco (POST /rest/v1/rpc/<nome>) usando a sessão do admin */
  function rpc(name, args) { return C.rest.rpc(name, args); }

  function status(c, now) {
    const t = now || Date.now();
    if (!c.is_active) return { key: "inactive", label: "Inativo", kind: "gray" };
    if (c.ends_at && Date.parse(c.ends_at) < t) return { key: "expired", label: "Expirado", kind: "red" };
    if (c.starts_at && Date.parse(c.starts_at) > t) return { key: "scheduled", label: "Agendado", kind: "silver" };
    if (c.max_uses !== null && (c.usage.confirmed + c.usage.reserved) >= c.max_uses) return { key: "exhausted", label: "Esgotado", kind: "red" };
    return { key: "active", label: "Ativo", kind: "green" };
  }

  /** "2026-12-31T23:59" (campo datetime-local, horário do aparelho) <-> ISO com fuso */
  function localToIso(v) { return v ? new Date(v).toISOString() : null; }
  function isoToLocal(iso) {
    if (!iso) return "";
    const d = new Date(iso), p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function fmtDate(iso) {
    return iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  }

  function parseInt1(text) {
    const s = String(text == null ? "" : text).trim();
    if (s === "") return null;
    if (!/^\d{1,9}$/.test(s)) return NaN;
    return parseInt(s, 10);
  }

  function normalizeCode(v) { return String(v || "").replace(/\s+/g, "").toUpperCase(); }

  /** f = { code, type, value(number), scope, productId, categoryId, startsAt, endsAt, min(number|null|NaN), max, perCustomer } */
  function validate(f) {
    const e = {};
    if (!CODE_RE.test(f.code)) e.code = "Use de 3 a 32 caracteres: letras, números, hífen ou _ (sem espaços). Ex.: VERAO10";
    if (isNaN(f.value) || f.value <= 0) e.value = f.type === "percent" ? "Informe o percentual, ex.: 10." : "Informe o valor do desconto, ex.: 15,00.";
    else if (f.type === "percent" && f.value > 100) e.value = "O percentual não pode passar de 100%.";
    else if (f.type === "fixed" && f.value >= 100000) e.value = "Valor alto demais. Confira.";
    if (f.scope === "product" && !f.productId) e.productId = "Escolha o produto.";
    if (f.scope === "category" && !f.categoryId) e.categoryId = "Escolha a categoria.";
    if (f.startsAt && f.endsAt && new Date(f.endsAt) <= new Date(f.startsAt)) e.endsAt = "O término precisa ser depois do início.";
    if (f.min !== null && (isNaN(f.min) || f.min < 0)) e.min = "Valor mínimo inválido, ex.: 150,00.";
    if (f.max !== null && (isNaN(f.max) || f.max < 1)) e.max = "Informe um número inteiro maior que zero.";
    if (f.perCustomer !== null && (isNaN(f.perCustomer) || f.perCustomer < 1)) e.perCustomer = "Informe um número inteiro maior que zero.";
    return e;
  }

  function friendlyError(err) {
    const msg = String(err && err.message || "");
    if (err && (err.code === "23505" || err.status === 409)) return new Error("Já existe um cupom com este código.");
    if (err && err.code === "23514") return new Error("Algum valor não é permitido (percentual até 100%, valores positivos, datas coerentes). Confira os campos.");
    return err instanceof Error ? err : new Error(msg || "Erro desconhecido.");
  }

  async function save(f, existingId) {
    const row = {
      code: f.code, description: f.description, discount_type: f.type, discount_value: f.value, scope: f.scope,
      product_id: f.scope === "product" ? f.productId : null,
      category_id: f.scope === "category" ? f.categoryId : null,
      starts_at: localToIso(f.startsAt), ends_at: localToIso(f.endsAt),
      min_purchase: f.min, max_uses: f.max, per_customer_limit: f.perCustomer,
      applies_to_promo_items: f.promoItems, is_active: f.active,
    };
    try {
      if (existingId) return (await C.rest.update("coupons", { id: eq(existingId) }, row))[0];
      return (await C.rest.insert("coupons", row))[0];
    } catch (e) { throw friendlyError(e); }
  }

  function setActive(id, active) { return C.rest.update("coupons", { id: eq(id) }, { is_active: active }); }
  function remove(id) { return C.rest.remove("coupons", { id: eq(id) }); }

  /* =============== PEÇAS DE TELA =============== */
  function loading() { return h("p", { class: "state" }, "Carregando…"); }
  function failure(err, retry) {
    return h("div", { class: "state state--error" }, h("p", null, err.message || "Algo deu errado."),
      retry ? h("button", { type: "button", class: "btn btn--ghost", onclick: retry }, "TENTAR DE NOVO") : null);
  }
  function pageHead(title, back) {
    return h("div", { class: "pagehead" },
      back ? h("a", { class: "pagehead__back", href: back, "aria-label": "Voltar" }, "‹") : null,
      h("h1", { class: "pagehead__title" }, title));
  }
  function badge(text, kind) { return h("span", { class: "badge badge--" + (kind || "gray") }, text); }

  function field(id, label, control, opts) {
    const o = opts || {};
    return h("div", { class: "field", "data-field": o.name || id },
      h("label", { class: "field__label", for: id }, label, o.optional ? h("span", { class: "field__opt" }, " (opcional)") : null),
      control,
      o.hint ? h("p", { class: "field__hint" }, o.hint) : null,
      h("p", { class: "field__error", role: "alert", hidden: true }));
  }
  function switchField(id, label, checked, hint) {
    return h("label", { class: "switch", for: id },
      h("span", { class: "switch__text" }, label, hint ? h("small", null, hint) : null),
      h("input", { type: "checkbox", id: id, checked: checked }),
      h("span", { class: "switch__track", "aria-hidden": "true" }));
  }
  function showErrors(form, errors) {
    form.querySelectorAll(".field").forEach(function (f) {
      const msg = errors[f.getAttribute("data-field")];
      const p = f.querySelector(".field__error");
      p.textContent = msg || ""; p.hidden = !msg;
      f.classList.toggle("has-error", !!msg);
    });
    const first = form.querySelector(".field.has-error");
    if (first) {
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      const focusable = first.querySelector("input, select, textarea");
      if (focusable) focusable.focus({ preventScroll: true });
    }
  }

  function describe(c) {
    const val = c.discount_type === "percent" ? String(c.discount_value).replace(".", ",") + "%" : U.brl(c.discount_value);
    let where = "carrinho inteiro";
    if (c.scope === "product") where = c.product ? "produto: " + c.product.name : "produto removido";
    if (c.scope === "category") where = c.category ? "categoria: " + c.category.name : "categoria removida";
    return val + " · " + where;
  }

  /* =============== LISTA =============== */
  async function listView(root) {
    U.fill(root, pageHead("Cupons", "#/"), loading());
    let data;
    try { data = await list(); }
    catch (e) { U.fill(root, pageHead("Cupons", "#/"), failure(e, function () { listView(root); })); return; }

    const ul = h("ul", { class: "list", id: "coupon-list" });
    const search = h("input", { type: "search", id: "coupon-search", placeholder: "Buscar por código…", autocomplete: "off", autocapitalize: "characters", "aria-label": "Buscar cupom por código" });

    function draw() {
      const q = normalizeCode(search.value);
      const rows = data.coupons.filter(function (c) { return !q || c.code.indexOf(q) !== -1; });
      U.fill(ul, rows.map(function (c) {
        const st = status(c);
        const used = c.usage.confirmed, held = c.usage.reserved;
        const usage = c.max_uses !== null
          ? used + " de " + c.max_uses + (c.max_uses === 1 ? " uso" : " usos") + (held ? " (+" + held + " reservado" + (held > 1 ? "s" : "") + ")" : "")
          : used + " uso" + (used === 1 ? "" : "s") + (held ? " (+" + held + " reservado" + (held > 1 ? "s" : "") + ")" : "");
        const validity = c.starts_at || c.ends_at
          ? (c.starts_at ? "de " + fmtDate(c.starts_at) : "") + (c.starts_at && c.ends_at ? " " : c.starts_at ? " · " : "") + (c.ends_at ? "até " + fmtDate(c.ends_at) : "sem data final")
          : "sem prazo";
        return h("li", { class: "row", "data-code": c.code },
          h("a", { class: "row__main", href: "#/cupons/" + c.id },
            h("span", { class: "row__info" },
              h("span", { class: "row__name coupon-code" }, c.code),
              h("span", { class: "row__price" }, describe(c)),
              h("span", { class: "row__sub" }, validity + " · " + usage),
              h("span", { class: "row__badges" }, badge(st.label, st.kind),
                c.min_purchase ? badge("mín. " + U.brl(c.min_purchase), "gray") : null,
                c.applies_to_promo_items ? badge("vale em promoção", "silver") : null))),
          h("button", { type: "button", class: "btn btn--small btn--ghost", "data-id": c.id, "data-active": c.is_active ? "1" : "0" }, c.is_active ? "Desativar" : "Ativar"));
      }));
      if (!rows.length) ul.appendChild(h("li", { class: "state" }, q ? "Nenhum cupom com este código." : "Nenhum cupom ainda."));
    }

    ul.addEventListener("click", async function (e) {
      const btn = e.target.closest("button[data-id]"); if (!btn) return;
      const turnOn = btn.getAttribute("data-active") !== "1";
      try {
        await U.busy(btn, "…", function () { return setActive(btn.getAttribute("data-id"), turnOn); });
        U.toast(turnOn ? "Cupom ativado." : "Cupom desativado.");
        listView(root);
      } catch (err) { U.toast(err.message, "error"); }
    });
    search.addEventListener("input", draw);

    U.fill(root, pageHead("Cupons", "#/"),
      h("a", { class: "btn btn--primary btn--xl", href: "#/cupons/novo" }, "+ NOVO CUPOM"),
      h("a", { class: "btn btn--ghost btn--xl", href: "#/cupons/usos" }, "VER PEDIDOS COM CUPOM"),
      h("div", { class: "search-bar" }, search),
      ul);
    draw();
  }

  /* =============== FORMULÁRIO =============== */
  async function formView(root, id) {
    U.fill(root, pageHead(id ? "Editar cupom" : "Novo cupom", "#/cupons"), loading());
    let data;
    try { data = await list(); }
    catch (e) { U.fill(root, pageHead("Cupom", "#/cupons"), failure(e, function () { formView(root, id); })); return; }
    const ex = id ? data.coupons.find(function (c) { return c.id === id; }) : null;
    if (id && !ex) { U.fill(root, pageHead("Cupom", "#/cupons"), h("p", { class: "state" }, "Cupom não encontrado.")); return; }

    const code = h("input", { id: "c-code", type: "text", value: ex ? ex.code : "", maxlength: "32", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", placeholder: "VERAO10" });
    code.addEventListener("input", function () { const p = code.selectionStart; code.value = normalizeCode(code.value); try { code.setSelectionRange(p, p); } catch (e) { /* ok */ } });
    const desc = h("input", { id: "c-desc", type: "text", value: ex ? ex.description : "", maxlength: "120", placeholder: "Ex.: Campanha de verão" });
    const type = h("select", { id: "c-type" },
      h("option", { value: "percent", selected: !ex || ex.discount_type === "percent" }, "Percentual (%)"),
      h("option", { value: "fixed", selected: ex && ex.discount_type === "fixed" }, "Valor fixo (R$)"));
    const value = h("input", { id: "c-value", type: "text", inputmode: "decimal", autocomplete: "off", value: ex ? U.priceInput(ex.discount_value).replace(/,00$/, "") : "", placeholder: "10" });
    const scope = h("select", { id: "c-scope" },
      h("option", { value: "cart", selected: !ex || ex.scope === "cart" }, "Carrinho inteiro"),
      h("option", { value: "product", selected: ex && ex.scope === "product" }, "Um produto"),
      h("option", { value: "category", selected: ex && ex.scope === "category" }, "Uma categoria"));
    const product = h("select", { id: "c-product" }, h("option", { value: "" }, "Escolha o produto…"),
      data.products.map(function (p) { return h("option", { value: p.id, selected: ex && ex.product_id === p.id }, p.name); }));
    const category = h("select", { id: "c-category" }, h("option", { value: "" }, "Escolha a categoria…"),
      data.categories.map(function (c) { return h("option", { value: c.id, selected: ex && ex.category_id === c.id }, c.name); }));
    const starts = h("input", { id: "c-start", type: "datetime-local", value: ex ? isoToLocal(ex.starts_at) : "" });
    const ends = h("input", { id: "c-end", type: "datetime-local", value: ex ? isoToLocal(ex.ends_at) : "" });
    const min = h("input", { id: "c-min", type: "text", inputmode: "decimal", autocomplete: "off", value: ex && ex.min_purchase !== null ? U.priceInput(ex.min_purchase) : "", placeholder: "150,00" });
    const max = h("input", { id: "c-max", type: "text", inputmode: "numeric", autocomplete: "off", value: ex && ex.max_uses !== null ? String(ex.max_uses) : "", placeholder: "100" });
    const per = h("input", { id: "c-per", type: "text", inputmode: "numeric", autocomplete: "off", value: ex && ex.per_customer_limit !== null ? String(ex.per_customer_limit) : "", placeholder: "1" });
    const promoItems = switchField("c-promo", "Vale também em peças em promoção", ex ? ex.applies_to_promo_items : false,
      "Desligado: o cupom ignora peças que já têm promoção. Ligado: o desconto incide sobre o preço promocional.");
    const active = switchField("c-active", "Cupom ativo", ex ? ex.is_active : true, "Desligue para pausar sem excluir.");

    const fValue = field("c-value", "Desconto", value, { name: "value" });
    const fProduct = field("c-product", "Produto", product, { name: "productId" });
    const fCategory = field("c-category", "Categoria", category, { name: "categoryId" });
    const hintUnit = h("p", { class: "field__hint", id: "c-unit" });

    function sync() {
      fProduct.hidden = scope.value !== "product";
      fCategory.hidden = scope.value !== "category";
      hintUnit.textContent = type.value === "percent"
        ? "Percentual de 0,01 a 100. O desconto é arredondado ao centavo mais próximo."
        : "Em reais. Nunca passa do valor das peças elegíveis.";
      value.placeholder = type.value === "percent" ? "10" : "15,00";
    }
    type.addEventListener("change", sync); scope.addEventListener("change", sync);

    const saveBtn = h("button", { type: "submit", class: "btn btn--primary btn--xl" }, "SALVAR CUPOM");
    const form = h("form", { class: "form", novalidate: true },
      field("c-code", "Código", code, { name: "code", hint: "Letras e números, sem espaços. O cliente pode digitar em maiúsculas ou minúsculas." }),
      field("c-desc", "Descrição interna", desc, { name: "description", optional: true }),
      h("div", { class: "field-row" }, field("c-type", "Tipo", type, { name: "type" }), fValue),
      hintUnit,
      field("c-scope", "Vale para", scope, { name: "scope" }), fProduct, fCategory,
      h("div", { class: "field-row field-row--dt" },
        field("c-start", "Início", starts, { name: "startsAt", optional: true }),
        field("c-end", "Término", ends, { name: "endsAt", optional: true })),
      field("c-min", "Compra mínima (R$)", min, { name: "min", optional: true, hint: "Considera o subtotal do carrinho inteiro, já com as promoções." }),
      h("div", { class: "field-row" },
        field("c-max", "Limite total de usos", max, { name: "max", optional: true }),
        field("c-per", "Limite por cliente", per, { name: "perCustomer", optional: true })),
      h("p", { class: "field__hint" }, "Um uso só é contado quando você confirma a compra em “Pedidos com cupom”. O limite por cliente é conferido pelo WhatsApp que você informar nessa confirmação."),
      h("div", { class: "switches" }, promoItems, active),
      saveBtn);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const minTxt = min.value.trim();
      const f = {
        code: normalizeCode(code.value), description: desc.value.trim(), type: type.value,
        value: U.parsePrice(value.value), scope: scope.value, productId: product.value, categoryId: category.value,
        startsAt: starts.value, endsAt: ends.value,
        min: minTxt === "" ? null : U.parsePrice(minTxt),
        max: parseInt1(max.value), perCustomer: parseInt1(per.value),
        promoItems: promoItems.querySelector("input").checked, active: active.querySelector("input").checked,
      };
      const errors = validate(f);
      showErrors(form, errors);
      if (Object.keys(errors).length) return;
      try {
        await U.busy(saveBtn, "Salvando…", function () { return save(f, ex && ex.id); });
        U.toast("Cupom salvo!");
        location.hash = "#/cupons";
      } catch (err) { U.toast(err.message, "error"); }
    });

    const children = [pageHead(ex ? "Editar cupom" : "Novo cupom", "#/cupons"), form];
    if (ex) {
      children.push(h("button", { type: "button", class: "btn btn--danger-text", id: "coupon-delete", onclick: async function () {
        const ok = await U.confirm({
          title: "Excluir o cupom “" + ex.code + "”?",
          text: "Ele deixa de funcionar na loja. O histórico de pedidos que usaram este cupom é mantido. Para só pausar, use “Desativar”.",
          confirmLabel: "Excluir", danger: true,
        });
        if (!ok) return;
        try { await remove(ex.id); U.toast("Cupom excluído."); location.hash = "#/cupons"; }
        catch (err) { U.toast(err.message, "error"); }
      } }, "Excluir cupom"));
    }
    U.fill(root, children);
    sync();
  }

  /* =============== PEDIDOS COM CUPOM (reservas e usos) =============== */
  function redemptionStatus(r, now) {
    const t = now || Date.now();
    if (r.status === "confirmed") return { key: "confirmed", label: "Confirmado", kind: "green" };
    if (r.status === "cancelled") return { key: "cancelled", label: "Cancelado", kind: "gray" };
    if (Date.parse(r.expires_at) < t) return { key: "expired", label: "Reserva vencida", kind: "red" };
    return { key: "reserved", label: "Reservado", kind: "silver" };
  }

  function askPhone(opts) {
    return new Promise(function (resolve) {
      const input = h("input", { type: "text", inputmode: "tel", autocomplete: "off", placeholder: "(11) 99999-9999", id: "ask-phone" });
      const err = h("p", { class: "field__error", role: "alert", hidden: true });
      const dlg = h("dialog", { class: "sheet", "aria-labelledby": "ask-title" },
        h("h2", { id: "ask-title", class: "sheet__title" }, opts.title),
        h("p", { class: "sheet__text" }, opts.text),
        h("div", { class: "field" }, h("label", { class: "field__label", for: "ask-phone" }, "WhatsApp do cliente", opts.required ? null : h("span", { class: "field__opt" }, " (opcional)")), input, err),
        h("div", { class: "sheet__actions" },
          h("button", { type: "button", class: "btn btn--ghost", "data-act": "no" }, "Voltar"),
          h("button", { type: "button", class: "btn btn--primary", "data-act": "yes" }, "Confirmar compra")));
      let answer = null;
      dlg.addEventListener("click", function (e) {
        const act = e.target.getAttribute && e.target.getAttribute("data-act");
        if (act === "yes") {
          const digits = input.value.replace(/\D/g, "");
          if (opts.required && digits.length < 10) { err.textContent = "Digite o WhatsApp com DDD."; err.hidden = false; input.focus(); return; }
          answer = input.value.trim(); dlg.close();
        } else if (act === "no" || e.target === dlg) dlg.close();
      });
      dlg.addEventListener("close", function () { dlg.remove(); resolve(answer); });
      document.body.appendChild(dlg); dlg.showModal(); input.focus();
    });
  }

  async function usageView(root, filter) {
    U.fill(root, pageHead("Pedidos com cupom", "#/cupons"), loading());
    let rows, coupons;
    try {
      const out = await Promise.all([
        C.rest.select("coupon_redemptions", { select: "*", order: "reserved_at.desc", limit: "200" }),
        C.rest.select("coupons", { select: "id,code,per_customer_limit" }),
      ]);
      rows = out[0]; coupons = {}; out[1].forEach(function (c) { coupons[c.id] = c; });
    } catch (e) { U.fill(root, pageHead("Pedidos com cupom", "#/cupons"), failure(e, function () { usageView(root, filter); })); return; }

    const sel = h("select", { id: "usage-filter", "aria-label": "Filtrar por situação" },
      [["", "Todos"], ["reserved", "Reservados (aguardando)"], ["confirmed", "Confirmados"], ["cancelled", "Cancelados"], ["expired", "Reservas vencidas"]]
        .map(function (o) { return h("option", { value: o[0], selected: (filter || "") === o[0] }, o[1]); }));
    const ul = h("ul", { class: "list", id: "usage-list" });

    function draw() {
      const f = sel.value;
      const shown = rows.filter(function (r) { return !f || redemptionStatus(r).key === f; });
      U.fill(ul, shown.map(function (r) {
        const st = redemptionStatus(r);
        const lines = (r.cart || []).map(function (l) { return l.qty + "x " + l.name; }).join(", ");
        const actionable = st.key === "reserved" || st.key === "expired";
        return h("li", { class: "row row--col", "data-ref": r.order_ref },
          h("div", { class: "row__info" },
            h("span", { class: "row__name coupon-code" }, r.order_ref),
            h("span", { class: "row__price" }, "Cupom " + r.coupon_code + " · −" + U.brl(r.discount_cents / 100) + " · total " + U.brl(r.total_cents / 100)),
            h("span", { class: "row__sub" }, lines),
            h("span", { class: "row__sub" }, fmtDate(r.reserved_at) + (st.key === "reserved" ? " · segura o cupom até " + fmtDate(r.expires_at) : "") + (r.customer_phone ? " · " + r.customer_phone : "")),
            h("span", { class: "row__badges" }, badge(st.label, st.kind))),
          h("div", { class: "row__actions" },
            actionable ? h("button", { type: "button", class: "btn btn--small btn--primary", "data-act": "confirm", "data-id": r.id }, "Confirmar compra") : null,
            st.key !== "cancelled" ? h("button", { type: "button", class: "btn btn--small btn--ghost", "data-act": "cancel", "data-id": r.id }, st.key === "confirmed" ? "Cancelar uso" : "Cancelar") : null));
      }));
      if (!shown.length) ul.appendChild(h("li", { class: "state" }, "Nenhum pedido nesta lista."));
    }

    ul.addEventListener("click", async function (e) {
      const btn = e.target.closest("button[data-act]"); if (!btn) return;
      const r = rows.find(function (x) { return x.id === btn.getAttribute("data-id"); }); if (!r) return;
      try {
        if (btn.getAttribute("data-act") === "confirm") {
          const c = coupons[r.coupon_id];
          const required = !!(c && c.per_customer_limit);
          const phone = await askPhone({
            title: "Confirmar a compra " + r.order_ref + "?",
            text: "Confirme só depois de a compra ser fechada com o cliente. A partir daqui o uso do cupom conta no limite." + (required ? " Este cupom tem limite por cliente: informe o WhatsApp." : ""),
            required: required,
          });
          if (phone === null) return;
          await U.busy(btn, "…", function () { return rpc("confirm_coupon_redemption", { p_id: r.id, p_customer_phone: phone || null }); });
          U.toast("Compra confirmada.");
        } else {
          const ok = await U.confirm({ title: "Cancelar " + r.order_ref + "?", text: "O cupom volta a ficar disponível para outros pedidos.", confirmLabel: "Cancelar pedido", cancelLabel: "Voltar", danger: true });
          if (!ok) return;
          await U.busy(btn, "…", function () { return rpc("cancel_coupon_redemption", { p_id: r.id }); });
          U.toast("Pedido cancelado.");
        }
        usageView(root, sel.value);
      } catch (err) { U.toast(err.message, "error"); }
    });
    sel.addEventListener("change", draw);

    U.fill(root, pageHead("Pedidos com cupom", "#/cupons"),
      h("p", { class: "field__hint" }, "Cada pedido enviado pelo WhatsApp com cupom aparece aqui como “Reservado”. O cupom só é consumido quando você confirma a compra."),
      h("div", { class: "search-bar" }, sel), ul);
    draw();
  }

  A.coupons = { list: list, status: status, validate: validate, save: save, normalizeCode: normalizeCode,
    listView: listView, formView: formView, usageView: usageView, redemptionStatus: redemptionStatus };
})();
