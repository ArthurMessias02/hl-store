/**
 * HL Store — INTERFACE DO CARRINHO
 * ------------------------------------------------------------
 * Botão da sacola, painel lateral (drawer), aviso de "adicionado" e
 * botões de adicionar dos produtos. A lógica de dados está em js/cart.js.
 */
(function () {
  "use strict";

  const Cart = window.HLCart;
  const $ = function (id) { return document.getElementById(id); };

  const cartBtn = $("cart-button");
  const badge = $("cart-badge");
  const overlay = $("cart-overlay");
  const drawer = $("cart");
  const title = $("cart-title");
  const body = $("cart-body");
  const foot = $("cart-foot");
  const totalEl = $("cart-total");
  const checkout = $("cart-checkout");
  const closeBtn = $("cart-close");
  const continueBtn = $("cart-continue");
  const clearBtn = $("cart-clear");
  const subtotalEl = $("cart-subtotal");
  const discountEl = $("cart-discount");
  const discountLabel = $("cart-discount-label");
  const summary = $("cart-summary");
  const noteEl = $("cart-note");
  const couponBox = $("coupon");
  const couponToggle = $("coupon-toggle");
  const couponForm = $("coupon-form");
  const couponInput = $("coupon-input");
  const couponApply = $("coupon-apply");
  const couponApplied = $("coupon-applied");
  const couponTag = $("coupon-tag");
  const couponAppliedText = $("coupon-applied-text");
  const couponRemove = $("coupon-remove");
  const couponMsg = $("coupon-msg");
  const toast = $("toast");
  const toastText = $("toast-text");
  const toastOpen = $("toast-open");

  if (!Cart || !cartBtn || !drawer) return;

  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- Aviso rápido (toast) ---------- */
  let toastTimer = null;
  function showToast(text, withOpenButton) {
    toastText.textContent = text;
    toastOpen.hidden = !withOpenButton;
    toast.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove("is-show"); }, 4000);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    toast.classList.remove("is-show");
  }

  function reasonText(reason) {
    switch (reason) {
      case "max-qty": return "Limite de " + Cart.maxPerItem + " unidades por peça.";
      case "max-lines": return "Limite de " + Cart.maxLines + " peças diferentes por pedido.";
      case "out-of-stock": return "Esta peça está indisponível no momento.";
      case "size": return "Tamanho indisponível para esta peça.";
      default: return "Não foi possível adicionar ao carrinho.";
    }
  }

  function bump() {
    if (reduceMotion()) return;
    cartBtn.classList.remove("bump");
    void cartBtn.offsetWidth; /* reinicia a animação */
    cartBtn.classList.add("bump");
  }
  cartBtn.addEventListener("animationend", function (e) {
    if (e.target === badge) cartBtn.classList.remove("bump");
  });

  /* ---------- Desenho do carrinho ---------- */
  let clearTimer = null;
  function disarmClear() {
    clearTimeout(clearTimer);
    clearBtn.textContent = "Limpar carrinho";
    delete clearBtn.dataset.armed;
  }

  function emptyState() {
    const box = el("div", "cart__empty");
    box.appendChild(el("p", "cart__empty-title", "Seu carrinho está vazio."));
    box.appendChild(el("p", "cart__empty-text", "Escolha um tamanho e toque em “Adicionar ao carrinho” nas peças que você gostar."));
    const go = el("button", "btn btn--ghost", "VER PEÇAS");
    go.type = "button";
    go.dataset.focus = "true";
    go.dataset.action = "browse";
    box.appendChild(go);
    return box;
  }

  function itemRow(line) {
    const li = el("li", "cart-item");
    li.dataset.key = line.key;
    li.dataset.id = line.id;
    li.dataset.size = line.size;

    const img = document.createElement("img");
    img.className = "cart-item__img";
    img.src = line.image;
    img.alt = "";
    img.width = 76;
    img.height = 95;
    img.decoding = "async"; /* sem lazy: o painel nasce fora da tela e a miniatura não carregaria a tempo */

    const info = el("div", "cart-item__info");

    const top = el("div", "cart-item__top");
    top.appendChild(el("p", "cart-item__name", line.name));
    top.appendChild(el("p", "cart-item__price", Cart.format(line.totalCents)));

    const meta = el("p", "cart-item__meta",
      "Tam. " + line.size + (line.qty > 1 ? " · " + Cart.format(line.unitCents) + " cada" : ""));

    const actions = el("div", "cart-item__actions");
    const label = line.name + ", tamanho " + line.size;

    const qty = el("div", "qty");
    qty.setAttribute("role", "group");
    qty.setAttribute("aria-label", "Quantidade: " + label);

    const dec = el("button", "qty__btn", "−");
    dec.type = "button";
    dec.dataset.action = "dec";
    dec.setAttribute("aria-label", "Diminuir quantidade: " + label);
    if (line.qty <= 1) dec.setAttribute("aria-disabled", "true");

    const val = el("span", "qty__val", String(line.qty));
    val.setAttribute("aria-live", "polite");

    const inc = el("button", "qty__btn", "+");
    inc.type = "button";
    inc.dataset.action = "inc";
    inc.setAttribute("aria-label", "Aumentar quantidade: " + label);
    if (line.qty >= Cart.maxPerItem) inc.setAttribute("aria-disabled", "true");

    qty.append(dec, val, inc);

    const rm = el("button", "cart-item__remove", "remover");
    rm.type = "button";
    rm.dataset.action = "remove";
    rm.setAttribute("aria-label", "Remover do carrinho: " + label);

    actions.append(qty, rm);
    info.append(top, meta, actions);
    li.append(img, info);
    return li;
  }

  function render() {
    const lines = Cart.lines();
    const count = Cart.count();

    badge.hidden = count === 0;
    badge.textContent = count > 99 ? "99+" : String(count);
    cartBtn.setAttribute("aria-label",
      count === 0 ? "Abrir carrinho, vazio" : "Abrir carrinho, " + count + (count === 1 ? " item" : " itens"));
    title.textContent = "SEU CARRINHO" + (count ? " (" + count + ")" : "");

    disarmClear();
    body.replaceChildren();

    if (!lines.length) {
      body.appendChild(emptyState());
      foot.hidden = true;
      return;
    }

    const list = el("ul", "cart__list");
    lines.forEach(function (l) { list.appendChild(itemRow(l)); });
    body.appendChild(list);

    foot.hidden = false;
    renderFoot();
  }

  /* ---------- Rodapé: cupom, subtotal, desconto e total ---------- */
  const Coupons = window.HLCoupons;
  let couponFormOpen = false;
  let couponNotice = ""; // aviso local (ex.: falha de rede ao enviar o pedido); some no próximo desenho

  function discountText(result) {
    if (!result) return "";
    if (result.discount_type === "percent") return String(parseFloat(result.discount_value)).replace(".", ",") + "% de desconto";
    return Cart.format(Math.round(Number(result.discount_value) * 100)) + " de desconto";
  }

  function renderFoot() {
    if (foot.hidden && !Cart.count()) return;
    const subtotal = Cart.totalCents();
    const discount = Coupons ? Coupons.discountCents() : 0;
    totalEl.textContent = Cart.format(subtotal - discount);
    checkout.href = Cart.whatsappUrl(); // sem cupom: a mensagem de sempre (o cupom só entra depois de reservado)

    if (!Coupons || !Coupons.enabled) { couponBox.hidden = true; summary.hidden = true; return; }
    couponBox.hidden = false;

    const st = Coupons.state;
    const applied = st.status === "applied" && discount > 0;
    const checking = st.status === "checking";
    const failed = st.status === "invalid" || st.status === "error";
    const showForm = !applied && !checking && (couponFormOpen || failed);

    couponToggle.hidden = applied || checking || showForm;
    couponToggle.setAttribute("aria-expanded", String(showForm));
    couponForm.hidden = !showForm;
    couponApplied.hidden = !(applied || checking);
    couponApply.disabled = checking;
    couponTag.textContent = st.code;
    couponAppliedText.textContent = checking ? "Verificando cupom…" : discountText(st.result);
    couponRemove.hidden = checking;

    if (showForm && st.code && document.activeElement !== couponInput) couponInput.value = st.code;

    const msg = couponNotice || (failed ? st.message : "");
    couponMsg.hidden = !msg;
    couponMsg.textContent = msg;
    couponMsg.classList.toggle("is-error", !!msg);
    couponNotice = "";

    summary.hidden = !applied;
    if (applied) {
      subtotalEl.textContent = Cart.format(subtotal);
      discountLabel.textContent = "Desconto (" + st.code + ")";
      discountEl.textContent = "−" + Cart.format(discount);
    }
    noteEl.textContent = applied
      ? "O desconto é conferido pela equipe ao confirmar o pedido no WhatsApp."
      : "Seu pedido será confirmado no atendimento pelo WhatsApp.";
  }

  if (Coupons) {
    Coupons.subscribe(renderFoot);

    couponToggle.addEventListener("click", function () {
      couponFormOpen = true;
      renderFoot();
      couponInput.focus();
    });

    couponForm.addEventListener("submit", function (e) {
      e.preventDefault();
      couponNotice = "";
      Coupons.apply(couponInput.value);
    });

    couponRemove.addEventListener("click", function () {
      couponFormOpen = false;
      couponInput.value = "";
      Coupons.remove();
      couponToggle.focus();
    });

    /* Com cupom aplicado, o banco confere de novo e RESERVA o cupom antes de abrir o WhatsApp.
       Sem cupom, o link funciona como sempre. */
    checkout.addEventListener("click", function (e) {
      if (Coupons.state.status !== "applied" || Coupons.discountCents() <= 0) return;
      e.preventDefault();
      if (checkout.getAttribute("aria-busy") === "true") return;

      const label = checkout.textContent;
      checkout.setAttribute("aria-busy", "true");
      checkout.textContent = "CONFERINDO CUPOM…";
      /* Abre a aba agora (o clique é o que o navegador exige); o endereço entra quando o banco responder */
      let win = null;
      try { win = window.open("", "_blank"); if (win) win.opener = null; } catch (err) { win = null; }

      Coupons.reserve().then(function (r) {
        if (r.ok) {
          const url = Cart.whatsappUrl({ couponCode: r.code, discountCents: r.discountCents, orderRef: r.orderRef });
          if (win) win.location.href = url; else window.location.href = url;
        } else {
          if (win) win.close();
          couponNotice = r.message;
          showToast(r.message);
        }
      }).then(function () {
        checkout.removeAttribute("aria-busy");
        checkout.textContent = label;
        renderFoot();
      });
    });
  }

  /* Redesenha mantendo o foco no mesmo controle (importante para teclado e leitor de tela) */
  function renderKeepingFocus() {
    const active = document.activeElement;
    let key = null;
    let action = null;
    let index = -1;

    if (active && drawer.contains(active)) {
      const li = active.closest(".cart-item");
      if (li) {
        key = li.dataset.key;
        action = active.dataset.action;
        index = Array.prototype.indexOf.call(li.parentNode.children, li);
      }
    }

    render();
    if (key === null) return;

    const rows = Array.prototype.slice.call(body.querySelectorAll(".cart-item"));
    const same = rows.find(function (r) { return r.dataset.key === key; });
    if (same) {
      const target = same.querySelector('[data-action="' + action + '"]');
      if (target) target.focus();
      return;
    }
    /* A linha foi removida: foco vai para a vizinha (ou para o estado vazio) */
    const near = rows[Math.min(index, rows.length - 1)];
    const next = near ? near.querySelector('[data-action="remove"]') : body.querySelector("[data-focus]");
    (next || closeBtn).focus();
  }

  /* ---------- Abrir e fechar ---------- */
  let lastFocus = null;
  let isOpen = false;

  function lockScroll() {
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty("--sbw", sbw + "px");
    document.documentElement.classList.add("cart-open");
  }

  function unlockScroll() {
    document.documentElement.classList.remove("cart-open");
    document.documentElement.style.removeProperty("--sbw");
  }

  function openCart() {
    if (isOpen) return;
    isOpen = true;
    lastFocus = document.activeElement;
    hideToast();
    render();
    lockScroll();
    overlay.classList.add("is-open");
    drawer.classList.add("is-open");
    cartBtn.setAttribute("aria-expanded", "true");
    closeBtn.focus();
  }

  function closeCart() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove("is-open");
    drawer.classList.remove("is-open");
    cartBtn.setAttribute("aria-expanded", "false");
    unlockScroll();
    const back = lastFocus && document.contains(lastFocus) && lastFocus !== document.body ? lastFocus : cartBtn;
    back.focus();
    lastFocus = null;
  }

  cartBtn.addEventListener("click", openCart);
  closeBtn.addEventListener("click", closeCart);
  continueBtn.addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);
  toastOpen.addEventListener("click", openCart);

  document.addEventListener("keydown", function (e) {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeCart();
      return;
    }
    if (e.key !== "Tab") return;

    /* Mantém o foco dentro do painel enquanto ele está aberto */
    const focusables = Array.prototype.slice.call(
      drawer.querySelectorAll('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])')
    ).filter(function (n) { return n.offsetParent !== null; });
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  });

  /* ---------- Ações dentro do painel ---------- */
  body.addEventListener("click", function (e) {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    if (action === "browse") {
      closeCart();
      const catalog = $("catalogo");
      if (catalog) catalog.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
      return;
    }

    const li = target.closest(".cart-item");
    if (!li) return;
    const id = li.dataset.id;
    const size = li.dataset.size;
    const line = Cart.lines().find(function (l) { return l.key === li.dataset.key; });
    if (!line) return;

    if (action === "remove") {
      Cart.remove(id, size);
    } else if (action === "inc") {
      const res = Cart.setQty(id, size, line.qty + 1);
      if (!res.ok && res.reason === "max-qty") showToast(reasonText("max-qty"));
    } else if (action === "dec") {
      if (line.qty > 1) Cart.setQty(id, size, line.qty - 1);
    }
  });

  clearBtn.addEventListener("click", function () {
    if (clearBtn.dataset.armed) {
      disarmClear();
      Cart.clear();
      return;
    }
    clearBtn.dataset.armed = "true";
    clearBtn.textContent = "Toque de novo para limpar";
    clearTimer = setTimeout(disarmClear, 3000);
  });

  /* ---------- Botões "Adicionar ao carrinho" nos produtos ---------- */
  document.addEventListener("click", function (e) {
    const add = e.target.closest("[data-add]");
    if (!add) return;

    const product = add.closest(".product");
    const picker = product && product.querySelector(".size-picker");
    const chosen = picker && picker.querySelector('input[type="radio"]:checked');

    if (!chosen) {
      if (picker) {
        picker.classList.add("has-error");
        const err = picker.querySelector(".size-picker__error");
        if (err) err.hidden = false;
        const firstRadio = picker.querySelector('input[type="radio"]');
        if (firstRadio) firstRadio.focus();
      }
      return;
    }

    const result = Cart.add(add.dataset.add, chosen.value);
    if (result.ok) {
      showToast(result.product.name + " · " + chosen.value + " adicionado ao carrinho.", true);
      bump();
    } else {
      showToast(reasonText(result.reason));
    }
  });

  /* Esconde o erro assim que o cliente escolhe um tamanho */
  document.addEventListener("change", function (e) {
    if (!e.target.matches('.size-picker input[type="radio"]')) return;
    const picker = e.target.closest(".size-picker");
    picker.classList.remove("has-error");
    const err = picker.querySelector(".size-picker__error");
    if (err) err.hidden = true;
  });

  /* ---------- Início ---------- */
  Cart.subscribe(renderKeepingFocus);
  render();
})();
