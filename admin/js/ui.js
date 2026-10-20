/**
 * AJUDANTES DE INTERFACE — HLAdmin.ui
 * ------------------------------------------------------------
 *  h()        monta elementos HTML pelo JavaScript. Textos entram como TEXTO (nunca como HTML),
 *             o que evita falhas de segurança (XSS) quando um nome de produto tem < ou ".
 *  toast()    aviso rápido de "salvo!" ou de erro.
 *  confirm()  janela de confirmação (usada antes de excluir).
 *  brl / parsePrice  formatação e leitura de preços em reais.
 */
(function () {
  "use strict";

  function h(tag, attrs) {
    const node = document.createElement(tag);
    const a = attrs || {};
    Object.keys(a).forEach(function (k) {
      const v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "class") node.className = v;
      else if (k.slice(0, 2) === "on" && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, "");
      else node.setAttribute(k, v);
    });
    function add(child) {
      if (child === null || child === undefined || child === false) return;
      if (Array.isArray(child)) child.forEach(add);
      else node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    for (let i = 2; i < arguments.length; i++) add(arguments[i]);
    return node;
  }

  /** Troca o conteúdo de um elemento. Aceita elementos, textos, listas (arrays) e ignora null/false.
   *  (replaceChildren do navegador NÃO aceita arrays: eles virariam o texto "[object HTMLDivElement]") */
  function fill(node) {
    const out = [];
    function add(c) {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else out.push(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    for (let i = 1; i < arguments.length; i++) add(arguments[i]);
    node.replaceChildren.apply(node, out);
    return node;
  }

  /* ---------- Avisos ---------- */
  function toast(message, type) {
    let box = document.getElementById("toasts");
    if (!box) {
      box = h("div", { id: "toasts", "aria-live": "polite", role: "status" });
      document.body.appendChild(box);
    }
    const t = h("div", { class: "toast toast--" + (type || "ok") }, message);
    box.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("is-show"); });
    setTimeout(function () {
      t.classList.remove("is-show");
      setTimeout(function () { t.remove(); }, 300);
    }, type === "error" ? 6500 : 3500);
  }

  /* ---------- Confirmação ---------- */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      if (typeof HTMLDialogElement === "undefined") { resolve(window.confirm(opts.title + "\n\n" + (opts.text || ""))); return; }
      const dlg = h("dialog", { class: "sheet", "aria-labelledby": "dlg-title" },
        h("h2", { id: "dlg-title", class: "sheet__title" }, opts.title),
        opts.text ? h("p", { class: "sheet__text" }, opts.text) : null,
        h("div", { class: "sheet__actions" },
          h("button", { type: "button", class: "btn btn--ghost", "data-act": "no" }, opts.cancelLabel || "Cancelar"),
          h("button", { type: "button", class: "btn " + (opts.danger ? "btn--danger" : "btn--primary"), "data-act": "yes" }, opts.confirmLabel || "Confirmar")
        )
      );
      let answer = false;
      dlg.addEventListener("click", function (e) {
        const act = e.target.getAttribute && e.target.getAttribute("data-act");
        if (act === "yes") { answer = true; dlg.close(); }
        else if (act === "no" || e.target === dlg) dlg.close();
      });
      dlg.addEventListener("close", function () { dlg.remove(); resolve(answer); });
      document.body.appendChild(dlg);
      dlg.showModal();
    });
  }

  /* ---------- Botão ocupado (evita clique duplo enquanto salva) ---------- */
  async function busy(btn, label, fn) {
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = label;
    try { return await fn(); }
    finally { btn.disabled = false; btn.textContent = old; }
  }

  /* ---------- Preços ---------- */
  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  function brl(n) { return fmt.format(n); }

  /** "89,90" | "89.90" | "R$ 1.299,90" -> 89.9 | 89.9 | 1299.9 (NaN se inválido) */
  function parsePrice(text) {
    let s = String(text == null ? "" : text).trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
    if (s.indexOf(",") !== -1) s = s.replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100) / 100;
  }
  function priceInput(n) { return n === null || n === undefined ? "" : Number(n).toFixed(2).replace(".", ","); }

  window.HLAdmin = window.HLAdmin || {};
  window.HLAdmin.ui = { h: h, fill: fill, toast: toast, confirm: confirmDialog, busy: busy, brl: brl, parsePrice: parsePrice, priceInput: priceInput };
})();
