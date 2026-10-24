/**
 * APLICATIVO DO PAINEL — roteador, login e sessão (HLAdmin)
 * ------------------------------------------------------------
 * O painel é uma página só (admin/index.html). A "tela" mostrada depende do
 * que vem depois do # na barra de endereço:
 *   #/login            entrar
 *   #/                 início
 *   #/produtos         lista    #/produtos/novo    #/produtos/<id>   formulário
 *   #/promocoes        lista    #/promocoes/nova   #/promocoes/<id>  formulário
 *   #/cupons           lista    #/cupons/novo      #/cupons/<id>     formulário    #/cupons/usos  pedidos com cupom
 *
 * Três coisas diferentes protegem o painel (não confunda):
 *  1) ESTA tela de login só pede e-mail e senha e entrega ao serviço de login (Supabase Auth).
 *  2) O Supabase Auth VALIDA a senha e devolve um token temporário.
 *  3) O BANCO confere o token em cada gravação (regras RLS em db/schema.sql).
 * Esconder botões aqui NÃO protege nada; o que protege é o item 3.
 */
(function () {
  "use strict";

  const A = window.HLAdmin, C = A.client, U = A.ui, V = A.views;
  const h = U.h;
  const root = document.getElementById("view");
  const nav = document.getElementById("nav");

  let adminChecked = false; // já confirmamos que ESTA sessão é de administrador?
  let loginNotice = "";     // aviso mostrado na tela de login (ex.: sessão expirada)
  let renderToken = 0;      // evita que uma tela lenta apague a tela atual

  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  /* ---------- Sair ---------- */
  A.logout = async function () {
    await C.auth.signOut();
    adminChecked = false;
    loginNotice = "Você saiu da conta.";
    go("#/login");
  };

  /* Sessão terminou sem o usuário pedir (token vencido e não renovável) */
  C.onSessionEnd(function (reason) {
    adminChecked = false;
    if (reason === "expired") loginNotice = "Sua sessão expirou. Entre novamente.";
    go("#/login");
  });

  /* ---------- Tela: banco não configurado ---------- */
  function notConfigured() {
    nav.hidden = true;
    U.fill(root, h("div", { class: "state" },
      h("h1", { class: "pagehead__title" }, "Falta configurar"),
      h("p", null, "O painel ainda não está ligado ao banco de dados. Preencha supabase.url e supabase.anonKey em js/config.js."),
      h("p", { class: "field__hint" }, "Passo a passo: docs/GUIA-CONFIGURACAO.md")));
  }

  /* ---------- Tela: login ---------- */
  function loginView() {
    nav.hidden = true;
    const email = h("input", { id: "l-email", type: "email", autocomplete: "username", inputmode: "email", autocapitalize: "none", spellcheck: "false", required: true });
    const pass = h("input", { id: "l-pass", type: "password", autocomplete: "current-password", required: true });
    const error = h("p", { class: "login__error", role: "alert", hidden: true });
    const btn = h("button", { type: "submit", class: "btn btn--primary btn--xl" }, "ENTRAR");
    const showPass = h("button", { type: "button", class: "btn btn--text login__toggle", "aria-pressed": "false" }, "Mostrar senha");
    showPass.addEventListener("click", function () {
      const show = pass.type === "password";
      pass.type = show ? "text" : "password";
      showPass.textContent = show ? "Ocultar senha" : "Mostrar senha";
      showPass.setAttribute("aria-pressed", show ? "true" : "false");
    });

    function fail(msg) { error.textContent = msg; error.hidden = false; }

    const form = h("form", { class: "form login__form", novalidate: true },
      h("div", { class: "field" }, h("label", { class: "field__label", for: "l-email" }, "E-mail"), email),
      h("div", { class: "field" }, h("label", { class: "field__label", for: "l-pass" }, "Senha"), pass, showPass),
      error, btn);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      error.hidden = true;
      if (!email.value.trim() || !pass.value) { fail("Preencha o e-mail e a senha."); return; }
      try {
        await U.busy(btn, "Entrando…", async function () {
          await C.auth.signIn(email.value.trim(), pass.value);
          if (!(await C.auth.isAdmin())) {
            await C.auth.signOut();
            throw new Error("Esta conta não tem permissão de administrador.");
          }
        });
        adminChecked = true;
        pass.value = "";
        go("#/");
      } catch (err) { fail(err.message); }
    });

    U.fill(root, h("div", { class: "login" },
      h("p", { class: "login__brand" }, "HL STORE"),
      h("h1", { class: "login__title" }, "Administração"),
      loginNotice ? h("p", { class: "login__notice", role: "status" }, loginNotice) : null,
      form,
      h("a", { class: "btn btn--text", href: "../index.html" }, "‹ Voltar à loja")));
    loginNotice = "";
    email.focus();
  }

  /* ---------- Rotas ---------- */
  function parse() {
    const raw = location.hash.replace(/^#/, "") || "/";
    const parts = raw.split("?");
    const query = {};
    new URLSearchParams(parts[1] || "").forEach(function (v, k) { query[k] = v; });
    return { path: parts[0].replace(/\/+$/, "") || "/", query: query };
  }

  function setNav(path) {
    nav.hidden = false;
    const section = path.indexOf("/produtos") === 0 ? "produtos" : path.indexOf("/promocoes") === 0 ? "promocoes" : path.indexOf("/cupons") === 0 ? "cupons" : "inicio";
    nav.querySelectorAll("a").forEach(function (a) {
      const on = a.getAttribute("data-nav") === section;
      a.classList.toggle("is-on", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  async function route() {
    const my = ++renderToken;
    if (!C.isConfigured()) { notConfigured(); return; }

    const r = parse();
    if (r.path === "/login") {
      if (C.auth.getSession() && adminChecked) { go("#/"); return; }
      loginView(); return;
    }

    /* Sem sessão -> login */
    if (!C.auth.getSession()) { go("#/login"); return; }

    /* Sessão existe (ex.: recarregou a página): confirma que é administrador */
    if (!adminChecked) {
      U.fill(root, h("p", { class: "state" }, "Verificando acesso…"));
      try {
        if (!(await C.auth.isAdmin())) {
          await C.auth.signOut();
          loginNotice = "Esta conta não tem permissão de administrador.";
          go("#/login"); return;
        }
        adminChecked = true;
      } catch (err) {
        if (my !== renderToken) return;
        if (!C.auth.getSession()) return; // sessão encerrou (o aviso já foi preparado)
        U.fill(root, h("div", { class: "state state--error" }, h("p", null, err.message),
          h("button", { type: "button", class: "btn btn--ghost", onclick: route }, "TENTAR DE NOVO")));
        return;
      }
      if (my !== renderToken) return;
    }

    setNav(r.path);
    window.scrollTo(0, 0);
    const seg = r.path.split("/").filter(Boolean); // ["produtos","abc"]
    if (!seg.length) return V.home(root);
    if (seg[0] === "produtos") {
      if (!seg[1]) return V.productList(root);
      return V.productForm(root, seg[1] === "novo" ? null : seg[1], r.query);
    }
    if (seg[0] === "promocoes") {
      if (!seg[1]) return V.promoList(root);
      return V.promoForm(root, seg[1] === "nova" ? null : seg[1], r.query);
    }
    if (seg[0] === "cupons") {
      if (!seg[1]) return A.coupons.listView(root);
      if (seg[1] === "usos") return A.coupons.usageView(root, r.query.situacao);
      return A.coupons.formView(root, seg[1] === "novo" ? null : seg[1]);
    }
    U.fill(root, h("p", { class: "state" }, "Página não encontrada."), h("a", { class: "btn btn--ghost", href: "#/" }, "Ir para o início"));
  }

  window.addEventListener("hashchange", route);
  route();
})();
