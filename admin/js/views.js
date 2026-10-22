/**
 * TELAS DO PAINEL — HLAdmin.views
 * ------------------------------------------------------------
 * Cada função desenha uma tela dentro do elemento #view.
 * Regra de ouro: nada de innerHTML com dados do usuário; usamos h() (ui.js).
 */
(function () {
  "use strict";

  const U = window.HLAdmin.ui, D = window.HLAdmin.data, C = window.HLAdmin.client;
  const h = U.h;
  const SIZE_PRESETS = ["P", "M", "G", "GG", "XG"];

  /* ---------- peças reutilizáveis ---------- */
  function loading() { return h("p", { class: "state" }, "Carregando…"); }

  function failure(err, retry) {
    return h("div", { class: "state state--error" },
      h("p", null, err.message || "Algo deu errado."),
      retry ? h("button", { type: "button", class: "btn btn--ghost", onclick: retry }, "TENTAR DE NOVO") : null);
  }

  function pageHead(title, back) {
    return h("div", { class: "pagehead" },
      back ? h("a", { class: "pagehead__back", href: back, "aria-label": "Voltar" }, "‹") : null,
      h("h1", { class: "pagehead__title" }, title));
  }

  function thumb(product) {
    const first = product && product.images && product.images[0];
    return first
      ? h("img", { class: "thumb", src: C.storage.publicUrl(first.path), alt: "", loading: "lazy", width: 80, height: 100 })
      : h("div", { class: "thumb thumb--empty", "aria-hidden": "true" }, "sem foto");
  }

  function badge(text, kind) { return h("span", { class: "badge badge--" + (kind || "gray") }, text); }

  function switchField(id, label, checked, hint) {
    return h("label", { class: "switch", for: id },
      h("span", { class: "switch__text" }, label, hint ? h("small", null, hint) : null),
      h("input", { type: "checkbox", id: id, checked: checked }),
      h("span", { class: "switch__track", "aria-hidden": "true" }));
  }

  function field(id, label, control, opts) {
    const o = opts || {};
    return h("div", { class: "field", "data-field": o.name || id },
      h("label", { class: "field__label", for: id }, label, o.optional ? h("span", { class: "field__opt" }, " (opcional)") : null),
      control,
      o.hint ? h("p", { class: "field__hint" }, o.hint) : null,
      h("p", { class: "field__error", role: "alert", hidden: true }));
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
      const focusable = first.querySelector("input, select, textarea, button");
      if (focusable) focusable.focus({ preventScroll: true });
    }
  }

  function greeting() {
    const hr = new Date().getHours();
    return hr < 12 ? "Bom dia" : hr < 18 ? "Boa tarde" : "Boa noite";
  }

  /* =============== INÍCIO =============== */
  async function home(root) {
    U.fill(root, h("div", { class: "home" },
      h("h1", { class: "home__hello" }, greeting() + "!"),
      h("p", { class: "home__sub" }, "O que você quer fazer hoje?"),
      h("a", { class: "btn btn--primary btn--xl", href: "#/produtos/novo" }, "+ ADICIONAR PRODUTO"),
      h("a", { class: "btn btn--primary btn--xl", href: "#/promocoes/nova" }, "+ NOVA PROMOÇÃO"),
      h("div", { class: "home__cards", id: "home-cards" }, loading()),
      h("a", { class: "btn btn--ghost btn--xl", href: "../index.html", target: "_blank", rel: "noopener" }, "VER A LOJA"),
      h("button", { type: "button", class: "btn btn--text", id: "home-logout" }, "Sair da conta")));
    root.querySelector("#home-logout").addEventListener("click", window.HLAdmin.logout);

    const box = root.querySelector("#home-cards");
    try {
      const products = await D.listProducts();
      const visible = products.filter(function (p) { return p.status === "published"; }).length;
      const promos = products.filter(function (p) { return p.promo && D.promoStatus(p.promo).key === "active"; }).length;
      U.fill(box, 
        h("a", { class: "card", href: "#/produtos" }, h("strong", null, String(products.length)), h("span", null, "Produtos"), h("small", null, visible + " visíveis na loja")),
        h("a", { class: "card", href: "#/promocoes" }, h("strong", null, String(promos)), h("span", null, "Promoções"), h("small", null, "ativas agora")));
    } catch (e) { U.fill(box, failure(e, function () { home(root); })); }
  }

  /* =============== PRODUTOS: LISTA =============== */
  async function productList(root) {
    U.fill(root, pageHead("Produtos", "#/"), loading());
    try {
      const products = await D.listProducts();
      const list = h("ul", { class: "list" });
      products.forEach(function (p) {
        const visible = p.status === "published";
        const priceNow = p.promo && D.promoStatus(p.promo).key === "active" ? p.promo.promo_price : null;
        list.appendChild(h("li", { class: "row" },
          h("a", { class: "row__main", href: "#/produtos/" + p.id },
            thumb(p),
            h("span", { class: "row__info" },
              h("span", { class: "row__name" }, p.name),
              h("span", { class: "row__price" }, priceNow ? [h("s", null, U.brl(p.price)), " ", U.brl(priceNow)] : U.brl(p.price)),
              h("span", { class: "row__badges" },
                badge(visible ? "Visível" : "Oculto", visible ? "green" : "gray"),
                p.in_stock ? null : badge("Sem estoque", "red"),
                p.promo ? badge("Promoção", "silver") : null))),
          h("button", { type: "button", class: "btn btn--small btn--ghost", "data-id": p.id }, visible ? "Ocultar" : "Mostrar")));
      });
      list.addEventListener("click", async function (e) {
        const btn = e.target.closest("button[data-id]");
        if (!btn) return;
        const p = products.find(function (x) { return x.id === btn.getAttribute("data-id"); });
        try {
          await U.busy(btn, "…", function () { return D.setProductVisible(p, p.status !== "published"); });
          U.toast(p.status === "published" ? "Produto ocultado da loja." : "Produto agora visível na loja.");
          productList(root);
        } catch (err) { U.toast(err.message, "error"); }
      });
      U.fill(root, pageHead("Produtos", "#/"),
        h("a", { class: "btn btn--primary btn--xl", href: "#/produtos/novo" }, "+ ADICIONAR PRODUTO"),
        products.length ? list : h("p", { class: "state" }, "Nenhum produto cadastrado ainda."));
    } catch (e) { U.fill(root, pageHead("Produtos", "#/"), failure(e, function () { productList(root); })); }
  }

  /* =============== PRODUTO: FORMULÁRIO =============== */
  async function productForm(root, id, query) {
    U.fill(root, pageHead(id ? "Editar produto" : "Novo produto", "#/produtos"), loading());
    let existing = null, categories = [];
    try {
      categories = await D.listCategories();
      if (id) {
        existing = await D.getProduct(id);
        if (!existing) { U.fill(root, pageHead("Produto", "#/produtos"), h("p", { class: "state" }, "Produto não encontrado.")); return; }
      }
    } catch (e) { U.fill(root, pageHead("Produto", "#/produtos"), failure(e, function () { productForm(root, id, query); })); return; }

    const st = {
      sizes: existing ? existing.sizes.slice() : [],
      images: existing ? existing.images.map(function (i) { return { id: i.id, path: i.path }; }) : [],
    };

    /* campos de texto */
    const name = h("input", { id: "f-name", type: "text", maxlength: 80, autocomplete: "off", value: existing ? existing.name : "", placeholder: "Ex.: Camisa Polo Slim" });
    const desc = h("textarea", { id: "f-desc", rows: 4, maxlength: 600, placeholder: "Descreva tecido, caimento, ocasião…" }, existing ? existing.description : "");
    const price = h("input", { id: "f-price", type: "text", inputmode: "decimal", autocomplete: "off", value: existing ? U.priceInput(existing.price) : "", placeholder: "89,90" });
    const cat = h("select", { id: "f-cat" },
      h("option", { value: "" }, "Sem categoria"),
      categories.map(function (c) { return h("option", { value: c.id, selected: existing && existing.category_id === c.id }, c.name); }),
      h("option", { value: "__new" }, "+ Nova categoria…"));
    const newCat = h("input", { id: "f-newcat", type: "text", maxlength: 40, placeholder: "Nome da nova categoria", hidden: true });
    cat.addEventListener("change", function () { newCat.hidden = cat.value !== "__new"; if (!newCat.hidden) newCat.focus(); });

    /* tamanhos */
    const sizesBox = h("div", { class: "chips", id: "f-sizes" });
    const customSize = h("input", { type: "text", maxlength: 6, placeholder: "Outro (ex.: 40)", "aria-label": "Adicionar outro tamanho", class: "chips__custom" });
    function renderSizes() {
      const all = SIZE_PRESETS.concat(st.sizes.filter(function (s) { return SIZE_PRESETS.indexOf(s) === -1; }));
      U.fill(sizesBox, all.map(function (s) {
        const on = st.sizes.indexOf(s) !== -1;
        return h("button", { type: "button", class: "chip" + (on ? " is-on" : ""), "aria-pressed": on ? "true" : "false", "data-size": s }, s);
      }), customSize);
    }
    sizesBox.addEventListener("click", function (e) {
      const b = e.target.closest("button[data-size]"); if (!b) return;
      const s = b.getAttribute("data-size"), i = st.sizes.indexOf(s);
      if (i === -1) st.sizes.push(s); else st.sizes.splice(i, 1);
      renderSizes();
    });
    customSize.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const v = customSize.value.trim().toUpperCase();
      if (v && st.sizes.indexOf(v) === -1) st.sizes.push(v);
      renderSizes(); sizesBox.querySelector(".chips__custom").focus();
    });
    customSize.addEventListener("blur", function () {
      const v = customSize.value.trim().toUpperCase();
      if (v && st.sizes.indexOf(v) === -1) { st.sizes.push(v); renderSizes(); }
    });

    /* fotos */
    const grid = h("div", { class: "photos", id: "f-photos" });
    const picker = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, hidden: true, id: "f-files" });
    function renderPhotos() {
      U.fill(grid, st.images.map(function (im, i) {
        return h("div", { class: "photo" },
          h("div", { class: "photo__img" },
            h("img", { src: im.previewUrl || C.storage.publicUrl(im.path), alt: "Foto " + (i + 1) }),
            i === 0 ? h("span", { class: "photo__main" }, "Principal") : null),
          h("div", { class: "photo__ctl" },
            h("button", { type: "button", "data-act": "left", "aria-label": "Mover foto " + (i + 1) + " para antes", disabled: i === 0 }, "‹"),
            h("button", { type: "button", "data-act": "right", "aria-label": "Mover foto " + (i + 1) + " para depois", disabled: i === st.images.length - 1 }, "›"),
            h("button", { type: "button", "data-act": "del", class: "is-danger", "aria-label": "Remover foto " + (i + 1) }, "✕")));
      }), st.images.length < D.MAX_PHOTOS ? h("button", { type: "button", class: "photo photo--add", id: "f-addphoto" }, h("span", null, "+"), h("small", null, "Adicionar fotos")) : null);
    }
    grid.addEventListener("click", function (e) {
      if (e.target.closest("#f-addphoto")) { picker.click(); return; }
      const b = e.target.closest("button[data-act]"); if (!b) return;
      const idx = Array.prototype.indexOf.call(grid.querySelectorAll(".photo:not(.photo--add)"), b.closest(".photo"));
      const act = b.getAttribute("data-act");
      if (act === "del") st.images.splice(idx, 1);
      else { const to = act === "left" ? idx - 1 : idx + 1; const tmp = st.images[idx]; st.images[idx] = st.images[to]; st.images[to] = tmp; }
      renderPhotos();
    });
    picker.addEventListener("change", async function () {
      const files = Array.prototype.slice.call(picker.files); picker.value = "";
      for (const f of files) {
        if (st.images.length >= D.MAX_PHOTOS) { U.toast("Limite de " + D.MAX_PHOTOS + " fotos.", "error"); break; }
        try { st.images.push(await D.prepareImage(f)); renderPhotos(); }
        catch (err) { U.toast(f.name + ": " + err.message, "error"); }
      }
    });

    const visible = switchField("f-visible", "Visível na loja", existing ? existing.status === "published" : true, "Desligado = oculto, ninguém vê");
    const stock = switchField("f-stock", "Em estoque", existing ? existing.in_stock : true);
    const featured = switchField("f-featured", "Destaque", existing ? existing.featured : false, "Mostra o selo DESTAQUE");

    const saveBtn = h("button", { type: "submit", class: "btn btn--primary btn--xl" }, existing ? "SALVAR ALTERAÇÕES" : "SALVAR PRODUTO");
    const form = h("form", { class: "form", novalidate: true },
      field("f-name", "Nome", name, { name: "name" }),
      field("f-desc", "Descrição", desc, { name: "description", optional: true }),
      field("f-price", "Preço normal (R$)", price, { name: "price" }),
      field("f-cat", "Categoria", h("div", null, cat, newCat), { name: "category", optional: true }),
      field("f-sizes", "Tamanhos", sizesBox, { name: "sizes", hint: "Toque para marcar. Para outro número, digite e aperte Enter." }),
      field("f-addphoto", "Fotos", h("div", null, grid, picker), { name: "images", hint: "A primeira é a principal. As fotos são reduzidas automaticamente." }),
      h("div", { class: "switches" }, visible, stock, featured),
      saveBtn);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const f = {
        name: name.value, description: desc.value, price: U.parsePrice(price.value),
        sizes: st.sizes, images: st.images, inStock: stock.querySelector("input").checked,
        featured: featured.querySelector("input").checked, visible: visible.querySelector("input").checked,
        categoryId: cat.value && cat.value !== "__new" ? cat.value : null,
        newCategory: cat.value === "__new" ? newCat.value : "",
      };
      const errors = D.validateProduct(f);
      if (cat.value === "__new" && !newCat.value.trim()) errors.category = "Digite o nome da nova categoria ou escolha outra opção.";
      showErrors(form, errors);
      if (Object.keys(errors).length) return;
      try {
        const newId = await U.busy(saveBtn, "Salvando…", function () { return D.saveProduct(f, existing); });
        U.toast("Produto salvo!");
        location.hash = query.next === "promo" ? "#/promocoes/nova?produto=" + newId : "#/produtos";
      } catch (err) { U.toast(err.message, "error"); }
    });

    const children = [pageHead(existing ? "Editar produto" : "Novo produto", "#/produtos"), form];
    if (existing) {
      children.push(h("button", { type: "button", class: "btn btn--danger-text", onclick: async function () {
        const ok = await U.confirm({
          title: "Excluir “" + existing.name + "”?",
          text: "As fotos" + (existing.promo ? " e a promoção" : "") + " dele também serão apagadas. Não dá para desfazer. Se só quer tirar da loja por um tempo, use “Visível na loja”.",
          confirmLabel: "Excluir", danger: true });
        if (!ok) return;
        try { await D.deleteProduct(existing); U.toast("Produto excluído."); location.hash = "#/produtos"; }
        catch (err) { U.toast(err.message, "error"); }
      } }, "Excluir produto"));
    }
    U.fill(root, children);
    renderSizes(); renderPhotos();
  }

  /* =============== PROMOÇÕES: LISTA =============== */
  async function promoList(root) {
    U.fill(root, pageHead("Promoções", "#/"), loading());
    try {
      const data = await D.listPromotions();
      const list = h("ul", { class: "list" });
      data.promotions.forEach(function (p) {
        const prod = p.product; if (!prod) return;
        const st = D.promoStatus(p);
        const kind = { active: "green", scheduled: "silver", expired: "red", inactive: "gray" }[st.key];
        list.appendChild(h("li", { class: "row" },
          h("a", { class: "row__main", href: "#/promocoes/" + p.id },
            thumb(prod),
            h("span", { class: "row__info" },
              h("span", { class: "row__name" }, prod.name),
              h("span", { class: "row__price" }, h("s", null, U.brl(prod.price)), " ", U.brl(p.promo_price), " ", h("em", null, "-" + D.discountPct(prod.price, p.promo_price) + "%")),
              h("span", { class: "row__badges" }, badge(st.label, kind)))),
          h("button", { type: "button", class: "btn btn--small btn--ghost", "data-id": p.id, "data-active": p.is_active ? "1" : "0" }, p.is_active ? "Desativar" : "Ativar")));
      });
      list.addEventListener("click", async function (e) {
        const btn = e.target.closest("button[data-id]"); if (!btn) return;
        const turnOn = btn.getAttribute("data-active") !== "1";
        try {
          await U.busy(btn, "…", function () { return D.setPromotionActive(btn.getAttribute("data-id"), turnOn); });
          U.toast(turnOn ? "Promoção ativada." : "Promoção desativada.");
          promoList(root);
        } catch (err) { U.toast(err.message, "error"); }
      });
      U.fill(root, pageHead("Promoções", "#/"),
        h("a", { class: "btn btn--primary btn--xl", href: "#/promocoes/nova" }, "+ NOVA PROMOÇÃO"),
        list.children.length ? list : h("p", { class: "state" }, "Nenhuma promoção ainda. Toque em “Nova promoção” para criar a primeira."));
    } catch (e) { U.fill(root, pageHead("Promoções", "#/"), failure(e, function () { promoList(root); })); }
  }

  /* =============== PROMOÇÃO: FORMULÁRIO =============== */
  async function promoForm(root, id, query) {
    U.fill(root, pageHead(id ? "Editar promoção" : "Nova promoção", "#/promocoes"), loading());
    let data;
    try { data = await D.listPromotions(); }
    catch (e) { U.fill(root, pageHead("Promoção", "#/promocoes"), failure(e, function () { promoForm(root, id, query); })); return; }

    const existing = id ? data.promotions.find(function (p) { return p.id === id; }) : null;
    if (id && !existing) { U.fill(root, pageHead("Promoção", "#/promocoes"), h("p", { class: "state" }, "Promoção não encontrada.")); return; }

    const available = data.products.filter(function (p) { return !p.promo; });
    if (!existing && !available.length) {
      U.fill(root, pageHead("Nova promoção", "#/promocoes"), h("div", { class: "state" },
        h("p", null, data.products.length ? "Todos os produtos já têm promoção. Edite uma existente ou cadastre um produto novo." : "Cadastre um produto antes de criar a promoção."),
        h("a", { class: "btn btn--primary", href: "#/produtos/novo?next=promo" }, "+ CADASTRAR PRODUTO")));
      return;
    }

    let product = existing ? existing.product : (available.find(function (p) { return p.id === query.produto; }) || null);

    const sel = h("select", { id: "p-product", disabled: !!existing },
      h("option", { value: "" }, "Escolha o produto…"),
      (existing ? [existing.product] : available).map(function (p) { return h("option", { value: p.id, selected: product && product.id === p.id }, p.name + " — " + U.brl(p.price)); }));
    const promoPrice = h("input", { id: "p-price", type: "text", inputmode: "decimal", autocomplete: "off", value: existing ? U.priceInput(existing.promo_price) : "", placeholder: "74,90" });
    const start = h("input", { id: "p-start", type: "date", value: existing ? D.isoToDate(existing.starts_at) : "" });
    const end = h("input", { id: "p-end", type: "date", value: existing ? D.isoToDate(existing.ends_at) : "" });
    const active = switchField("p-active", "Promoção ativa", existing ? existing.is_active : true, "Só aparece na loja se estiver ativa e dentro do prazo");

    const summary = h("div", { class: "summary", "aria-live": "polite" });
    function renderSummary() {
      const pp = U.parsePrice(promoPrice.value);
      if (!product) { U.fill(summary, h("p", null, "Escolha um produto para ver o preço original.")); return; }
      const ok = !isNaN(pp) && pp > 0 && pp < product.price;
      U.fill(summary, 
        h("p", null, "Preço original: ", h("strong", null, U.brl(product.price))),
        h("p", null, "Desconto: ", h("strong", null, ok ? D.discountPct(product.price, pp) + "%" : "—"),
          ok ? "  ·  o cliente economiza " + U.brl(Math.round((product.price - pp) * 100) / 100) : ""));
    }
    sel.addEventListener("change", function () {
      product = data.products.find(function (p) { return p.id === sel.value; }) || null; renderSummary();
    });
    promoPrice.addEventListener("input", renderSummary);

    const saveBtn = h("button", { type: "submit", class: "btn btn--primary btn--xl" }, "SALVAR PROMOÇÃO");
    const form = h("form", { class: "form", novalidate: true },
      field("p-product", "Produto", h("div", null, sel,
        existing ? null : h("a", { class: "inline-link", href: "#/produtos/novo?next=promo" }, "Produto não está na lista? Cadastrar novo")), { name: "product" }),
      h("div", { class: "summary-wrap" }, summary),
      field("p-price", "Preço promocional (R$)", promoPrice, { name: "promoPrice" }),
      h("div", { class: "field-row" },
        field("p-start", "Início", start, { name: "startDate", optional: true }),
        field("p-end", "Término", end, { name: "endDate", optional: true })),
      h("p", { class: "field__hint" }, "Sem datas = vale a partir de agora, sem prazo para acabar. O dia do término é incluído."),
      h("div", { class: "switches" }, active),
      saveBtn);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const f = { productId: sel.value, promoPrice: U.parsePrice(promoPrice.value), startDate: start.value, endDate: end.value, active: active.querySelector("input").checked };
      const errors = D.validatePromotion(f, product);
      showErrors(form, errors);
      if (Object.keys(errors).length) return;
      try {
        await U.busy(saveBtn, "Salvando…", function () { return D.savePromotion(f, existing && existing.id); });
        U.toast("Promoção salva!");
        location.hash = "#/promocoes";
      } catch (err) { U.toast(err.message, "error"); }
    });

    const children = [pageHead(existing ? "Editar promoção" : "Nova promoção", "#/promocoes"), form];
    if (existing) {
      children.push(h("button", { type: "button", class: "btn btn--danger-text", onclick: async function () {
        const ok = await U.confirm({ title: "Excluir a promoção de “" + existing.product.name + "”?", text: "O produto continua na loja pelo preço normal.", confirmLabel: "Excluir", danger: true });
        if (!ok) return;
        try { await D.deletePromotion(existing.id); U.toast("Promoção excluída."); location.hash = "#/promocoes"; }
        catch (err) { U.toast(err.message, "error"); }
      } }, "Excluir promoção"));
    }
    U.fill(root, children);
    renderSummary();
  }

  window.HLAdmin.views = { home: home, productList: productList, productForm: productForm, promoList: promoList, promoForm: promoForm };
})();
