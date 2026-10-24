/* ============ HL STORE — Popup de Captação & 10% OFF ============
   Validação, normalização E.164, gravação no Supabase via RPC,
   localStorage e botão flutuante premium sempre acessível. */
(function () {
  "use strict";

  /* Código exibido ao cliente. Quem valida o cupom é o banco (db/coupons.sql); o carrinho tem o campo para aplicá-lo. */
  const WELCOME_CODE = (window.HL_CONFIG && window.HL_CONFIG.welcomeCouponCode) || "BEMVINDO10";

  const STORAGE_KEY = "hl_lead_status"; // 'registered' | 'closed'
  const STORAGE_DATE = "hl_lead_date";
  const DAYS_SUPPRESS_ON_CLOSE = 7;

  function isSupabaseConfigured() {
    return Boolean(
      window.HL_CONFIG &&
      window.HL_CONFIG.supabase &&
      window.HL_CONFIG.supabase.url &&
      window.HL_CONFIG.supabase.anonKey
    );
  }

  function isRegistered() {
    return localStorage.getItem(STORAGE_KEY) === "registered";
  }

  function shouldAutoOpen() {
    if (isRegistered()) return false;
    const status = localStorage.getItem(STORAGE_KEY);
    if (status === "closed") {
      const closedAt = parseInt(localStorage.getItem(STORAGE_DATE) || "0", 10);
      const elapsedDays = (Date.now() - closedAt) / (1000 * 60 * 60 * 24);
      if (elapsedDays < DAYS_SUPPRESS_ON_CLOSE) return false;
    }
    return true;
  }

  function normalizePhone(raw) {
    let digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return null;
    if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
      return "+" + digits;
    }
    if (digits.length === 10 || digits.length === 11) {
      return "+55" + digits;
    }
    return null;
  }

  function formatPhoneDisplay(value) {
    let d = value.replace(/\D/g, "").slice(0, 11);
    if (!d) return "";
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  async function submitLead(name, phone, consent) {
    if (!isSupabaseConfigured()) {
      return { ok: true, coupon: "BEMVINDO10" };
    }

    const { url, anonKey } = window.HL_CONFIG.supabase;
    const endpoint = `${url.replace(/\/$/, "")}/rest/v1/rpc/register_customer`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": anonKey,
        "Authorization": `Bearer ${anonKey}`
      },
      body: JSON.stringify({
        p_name: name,
        p_phone: phone,
        p_promo_consent: consent,
        p_source: "popup_10off"
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || "Falha na comunicação com o servidor.");
    }

    return await res.json();
  }

  /* ---------- Conta (login e senha) via Supabase Auth ----------
     A senha só viaja por HTTPS direto ao Supabase Auth (que guarda apenas o hash).
     Nunca é salva no localStorage nem no banco da loja. */
  function authRequest(path, body) {
    const { url, anonKey } = window.HL_CONFIG.supabase;
    return fetch(`${url.replace(/\/$/, "")}/auth/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": anonKey },
      body: JSON.stringify(body)
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = String(data.msg || data.error_description || data.message || "").toLowerCase();
        if (msg.includes("already") || msg.includes("registered")) throw new Error("Este e-mail já tem cadastro. Use a aba ENTRAR.");
        if (msg.includes("invalid login") || msg.includes("invalid_credentials")) throw new Error("E-mail ou senha incorretos.");
        if (msg.includes("not confirmed")) throw new Error("Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.");
        if (res.status === 429) throw new Error("Muitas tentativas. Aguarde um instante e tente de novo.");
        throw new Error("Não foi possível concluir agora. Tente novamente.");
      }
      return data;
    });
  }

  function passwordScore(pw) {
    if (!pw) return 0;
    let n = 0;
    if (pw.length >= 8) n++;
    if (pw.length >= 12) n++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) n++;
    return Math.max(1, Math.min(4, n));
  }

  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  function initPopup() {
    const modalBackdrop = document.getElementById("lead-modal-backdrop");
    const closeBtn = document.getElementById("lead-modal-close");
    const form = document.getElementById("lead-form");
    const nameInput = document.getElementById("lead-name");
    const phoneInput = document.getElementById("lead-phone");
    const consentInput = document.getElementById("lead-consent");
    const errorEl = document.getElementById("lead-error");
    const submitBtn = document.getElementById("lead-submit");
    const successView = document.getElementById("lead-success-view");
    const copyCouponBtn = document.getElementById("lead-copy-coupon");

    if (!modalBackdrop) return;

    const couponCodeEl = modalBackdrop.querySelector(".lead-coupon-code");
    if (couponCodeEl) couponCodeEl.textContent = WELCOME_CODE;

    // Cria o botão flutuante premium no canto inferior
    let floatingBtn = document.getElementById("lead-floating-trigger");
    if (!floatingBtn && !isRegistered()) {
      floatingBtn = document.createElement("button");
      floatingBtn.id = "lead-floating-trigger";
      floatingBtn.type = "button";
      floatingBtn.className = "lead-floating-btn";
      floatingBtn.setAttribute("aria-label", "Ganhe 10% de desconto na primeira compra");
      floatingBtn.innerHTML = `
        <span class="lead-floating-btn__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="5" x2="5" y2="19"></line>
            <circle cx="6.5" cy="6.5" r="2.5"></circle>
            <circle cx="17.5" cy="17.5" r="2.5"></circle>
          </svg>
        </span>
        <span class="lead-floating-btn__text">
          <small>PRIMEIRA COMPRA</small>
          <strong>GANHE 10% OFF</strong>
        </span>
      `;
      document.body.appendChild(floatingBtn);

      floatingBtn.addEventListener("click", () => {
        openModal();
      });
    }

    function openModal() {
      modalBackdrop.classList.add("is-open");
      modalBackdrop.removeAttribute("hidden");
      if (floatingBtn) floatingBtn.classList.add("is-hidden");
      if (nameInput) nameInput.focus();
    }

    function closeModal() {
      modalBackdrop.classList.remove("is-open");
      modalBackdrop.setAttribute("hidden", "true");
      if (!isRegistered()) {
        localStorage.setItem(STORAGE_KEY, "closed");
        localStorage.setItem(STORAGE_DATE, Date.now().toString());
        if (floatingBtn) floatingBtn.classList.remove("is-hidden");
      }
    }

    // Abertura automática com delay elegante
    if (shouldAutoOpen()) {
      setTimeout(openModal, 6000);
    }

    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modalBackdrop.classList.contains("is-open")) {
        closeModal();
      }
    });

    if (phoneInput) {
      phoneInput.addEventListener("input", (e) => {
        e.target.value = formatPhoneDisplay(e.target.value);
      });
    }

    if (copyCouponBtn) {
      copyCouponBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(WELCOME_CODE).then(() => {
          copyCouponBtn.textContent = "COPIADO!";
          setTimeout(() => { copyCouponBtn.textContent = "COPIAR"; }, 2500);
        });
      });
    }

    /* ----- Abas: criar conta / entrar ----- */
    const emailInput = document.getElementById("lead-email");
    const passInput = document.getElementById("lead-password");
    const eyeBtn = document.getElementById("lead-eye");
    const forgotBtn = document.getElementById("lead-forgot");
    const strengthEl = document.getElementById("lead-strength");
    const strengthLabel = document.getElementById("lead-strength-label");
    const tabs = Array.from(document.querySelectorAll(".lead-tab"));
    const COPY = {
      signup: {
        tag: "CONVITE EXCLUSIVO", title: "Entre para o clube",
        desc: "Crie sua conta e ganhe <strong>10% de desconto</strong> na primeira compra, além de acesso antecipado aos lançamentos.",
        btn: "CRIAR CONTA E GANHAR 10%", autocomplete: "new-password"
      },
      login: {
        tag: "BEM-VINDO DE VOLTA", title: "Acesse sua conta",
        desc: "Entre com seu e-mail e senha para acompanhar seus benefícios.",
        btn: "ENTRAR", autocomplete: "current-password"
      }
    };
    let mode = "signup";

    function setMode(next) {
      mode = next;
      const c = COPY[mode];
      tabs.forEach((t) => {
        const on = t.dataset.mode === mode;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
      });
      document.getElementById("lead-tag").textContent = c.tag;
      document.getElementById("lead-modal-title").textContent = c.title;
      document.getElementById("lead-modal-desc").innerHTML = c.desc;
      submitBtn.textContent = c.btn;
      passInput.setAttribute("autocomplete", c.autocomplete);
      passInput.placeholder = mode === "signup" ? "Mínimo de 8 caracteres" : "Sua senha";
      form.querySelectorAll('[data-only]').forEach((el) => {
        el.hidden = el.dataset.only !== mode;
      });
      forgotBtn.hidden = mode !== "login";
      clearFeedback();
    }

    function clearFeedback() {
      errorEl.className = "lead-alert";
      errorEl.textContent = "";
      form.querySelectorAll("input[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
    }

    function fail(msg, input) {
      errorEl.textContent = msg;
      errorEl.className = "lead-alert is-error";
      if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); }
    }

    tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
    setMode("signup");

    eyeBtn.addEventListener("click", () => {
      const show = passInput.type === "password";
      passInput.type = show ? "text" : "password";
      passInput.classList.toggle("is-revealed", show);
      eyeBtn.setAttribute("aria-pressed", String(show));
      eyeBtn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
    });

    passInput.addEventListener("input", () => {
      const lvl = passwordScore(passInput.value);
      strengthEl.dataset.level = String(lvl);
      strengthLabel.textContent = ["", "Fraca", "Razoável", "Boa", "Forte"][lvl];
    });

    forgotBtn.addEventListener("click", async () => {
      clearFeedback();
      const email = emailInput.value.trim();
      if (!isEmail(email)) return fail("Digite seu e-mail acima para recuperar a senha.", emailInput);
      try {
        if (isSupabaseConfigured()) await authRequest("recover", { email });
        errorEl.textContent = "Se este e-mail tiver cadastro, enviamos o link para redefinir a senha.";
        errorEl.className = "lead-alert is-info";
      } catch (err) {
        fail(err.message);
      }
    });

    function showSuccess(kind, needsConfirm) {
      form.style.display = "none";
      document.getElementById("lead-tabs").style.display = "none";
      const titleEl = document.getElementById("lead-modal-title");
      const textEl = document.getElementById("lead-success-text");
      if (kind === "signup") {
        document.getElementById("lead-tag").textContent = "CONTA CRIADA";
        titleEl.textContent = "Bem-vindo à HL Store";
        document.getElementById("lead-modal-desc").textContent = "Seu cupom de primeira compra está liberado:";
        textEl.textContent = needsConfirm
          ? "Enviamos um e-mail para você confirmar o cadastro. Depois, aplique o código no carrinho antes de finalizar o pedido."
          : "Aplique este código no carrinho antes de finalizar o pedido. O desconto é conferido ao confirmar a compra.";
      } else {
        document.getElementById("lead-tag").textContent = "ACESSO CONFIRMADO";
        titleEl.textContent = "Que bom te ver de novo";
        document.getElementById("lead-modal-desc").textContent = "Você já está dentro. Seu cupom continua disponível:";
        textEl.textContent = "Aplique o código no carrinho antes de finalizar o pedido.";
      }
      successView.removeAttribute("hidden");
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearFeedback();

      const email = emailInput.value.trim().toLowerCase();
      const password = passInput.value;
      const rawName = nameInput.value.trim();
      const normPhone = normalizePhone(phoneInput.value);

      if (mode === "signup") {
        if (rawName.length < 2) return fail("Por favor, informe seu nome.", nameInput);
        if (!normPhone) return fail("Digite um WhatsApp válido com DDD (ex: 11 99999-9999).", phoneInput);
      }
      if (!isEmail(email)) return fail("Digite um e-mail válido.", emailInput);
      if (mode === "signup" && password.length < 8) return fail("A senha precisa ter pelo menos 8 caracteres.", passInput);
      if (mode === "login" && !password) return fail("Digite sua senha.", passInput);

      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = "PROCESSANDO…";

      try {
        let needsConfirm = false;
        if (mode === "signup") {
          if (isSupabaseConfigured()) {
            const auth = await authRequest("signup", {
              email, password, data: { name: rawName, phone: normPhone }
            });
            needsConfirm = !auth.access_token;
          }
          const res = await submitLead(rawName, normPhone, consentInput.checked);
          if (res && res.ok === false) throw new Error(res.error || "Não foi possível validar seu cadastro.");
        } else if (isSupabaseConfigured()) {
          await authRequest("token?grant_type=password", { email, password });
        }

        localStorage.setItem(STORAGE_KEY, "registered");
        if (floatingBtn) floatingBtn.remove();
        passInput.value = "";
        showSuccess(mode, needsConfirm);
      } catch (err) {
        fail(err.message || "Ocorreu um erro. Tente novamente.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPopup);
  } else {
    initPopup();
  }
})();