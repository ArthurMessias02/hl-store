/* ============ HL STORE — Módulo de Clientes do Painel Admin ============
   Listagem, contagem, busca, contato via WhatsApp e EXCLUSÃO de clientes. */
(function () {
  "use strict";

  function getBaseUrl() {
    return window.HL_CONFIG && window.HL_CONFIG.supabase ? window.HL_CONFIG.supabase.url.replace(/\/$/, "") : "";
  }

  function getAnonKey() {
    return window.HL_CONFIG && window.HL_CONFIG.supabase ? window.HL_CONFIG.supabase.anonKey : "";
  }

  function getAdminToken() {
    if (window.HLAdmin) {
      if (window.HLAdmin.token) return window.HLAdmin.token;
      if (window.HLAdmin.auth && window.HLAdmin.auth.access_token) return window.HLAdmin.auth.access_token;
      if (window.HLAdmin.session && window.HLAdmin.session.access_token) return window.HLAdmin.session.access_token;
      if (window.HLAdmin.state && window.HLAdmin.state.auth && window.HLAdmin.state.auth.access_token) return window.HLAdmin.state.auth.access_token;
    }

    const storages = [localStorage, sessionStorage];
    for (const store of storages) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!k) continue;
        const val = store.getItem(k);
        if (!val) continue;

        if (typeof val === "string" && val.startsWith("ey") && val.split(".").length === 3) {
          return val;
        }

        if (val.startsWith("{") || val.startsWith("[")) {
          try {
            const data = JSON.parse(val);
            if (data) {
              if (data.access_token) return data.access_token;
              if (data.token) return typeof data.token === "string" ? data.token : data.token.access_token;
              if (data.currentSession && data.currentSession.access_token) return data.currentSession.access_token;
              if (data.session && data.session.access_token) return data.session.access_token;
              if (data.auth && data.auth.access_token) return data.auth.access_token;
            }
          } catch (_) {}
        }
      }
    }
    return null;
  }

  function formatDisplayPhone(p) {
    const digits = (p || "").replace(/\D/g, "");
    if (digits.length === 13 && digits.startsWith("55")) {
      return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 12 && digits.startsWith("55")) {
      return `(${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
    }
    return p;
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  async function fetchCustomers(search = "") {
    const base = getBaseUrl();
    const token = getAdminToken();
    const anon = getAnonKey();

    if (!base) return { ok: false, error: "URL do Supabase não configurada." };
    if (!token) {
      return { ok: false, error: "Sessão não identificada. Saia e faça login novamente no painel." };
    }

    const p = new URLSearchParams({
      select: "id,name,phone,promo_consent,consent_at,created_at,source",
      order: "created_at.desc"
    });
    if (search) {
      p.set("or", `(name.ilike.*${search}*,phone.ilike.*${search}*)`);
    }

    try {
      const res = await fetch(`${base}/rest/v1/customers?${p}`, {
        headers: {
          "apikey": anon,
          "Authorization": `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Erro de permissão no Supabase.");
      }

      const data = await res.json();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // Função para deletar o cliente do Supabase
  async function deleteCustomer(id) {
    const base = getBaseUrl();
    const token = getAdminToken();
    const anon = getAnonKey();

    if (!base || !token) return { ok: false, error: "Não autenticado." };

    try {
      const res = await fetch(`${base}/rest/v1/customers?id=eq.${id}`, {
        method: "DELETE",
        headers: {
          "apikey": anon,
          "Authorization": `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Erro ao excluir cliente.");
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function countCustomers() {
    const base = getBaseUrl();
    const token = getAdminToken();
    const anon = getAnonKey();
    if (!base || !token) return 0;

    try {
      const res = await fetch(`${base}/rest/v1/customers?select=id`, {
        headers: {
          "apikey": anon,
          "Authorization": `Bearer ${token}`,
          "Range-Unit": "items",
          "Range": "0-0",
          "Prefer": "count=exact"
        }
      });
      const range = res.headers.get("content-range");
      if (range && range.includes("/")) {
        return parseInt(range.split("/")[1], 10) || 0;
      }
      const data = await res.json();
      return Array.isArray(data) ? data.length : 0;
    } catch (_) {
      return 0;
    }
  }

  function renderView() {
    const view = document.getElementById("view");
    if (!view) return;

    view.innerHTML = `
      <div class="pagehead"><h1 class="pagehead__title">Clientes</h1></div>
      <div class="search-bar">
        <input type="text" id="cust-search" placeholder="Buscar por nome ou WhatsApp…" autocomplete="off" />
      </div>
      <div id="cust-list" class="customer-list">
        <p class="state">Carregando clientes…</p>
      </div>
    `;

    const searchInput = document.getElementById("cust-search");
    const listContainer = document.getElementById("cust-list");

    async function load(query = "") {
      listContainer.innerHTML = '<p class="state">Buscando…</p>';
      const res = await fetchCustomers(query);

      if (!res.ok) {
        listContainer.innerHTML = `
          <div class="state state--error">
            <p>${res.error}</p>
            <button class="btn btn--small" id="cust-retry">Tentar novamente</button>
          </div>
        `;
        const retryBtn = document.getElementById("cust-retry");
        if (retryBtn) retryBtn.addEventListener("click", () => load(query));
        return;
      }

      const items = res.data;
      if (!items || !items.length) {
        listContainer.innerHTML = `
          <div class="state">
            <p>${query ? "Nenhum cliente encontrado para esta busca." : "Nenhum cliente cadastrado ainda."}</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = items.map((c) => {
        const cleanDigits = (c.phone || "").replace(/\D/g, "");
        const waMsg = encodeURIComponent(`Olá ${c.name}, tudo bem? Falamos da HL Store.`);
        const waUrl = `https://wa.me/${cleanDigits}?text=${waMsg}`;
        const consentBadge = c.promo_consent
          ? '<span class="badge badge--green">Consentimento OK</span>'
          : '<span class="badge badge--red">Sem promoções</span>';

        return `
          <div class="customer-card" id="customer-row-${c.id}">
            <div class="customer-header">
              <span class="customer-name">${c.name}</span>
              <span class="customer-date">${formatDate(c.created_at)}</span>
            </div>
            <div class="customer-details">
              <div style="display: flex; gap: 8px; align-items: center;">
                <span class="customer-phone">${formatDisplayPhone(c.phone)}</span>
                ${consentBadge}
              </div>
              <div class="customer-actions">
                <a class="btn btn--whatsapp" href="${waUrl}" target="_blank" rel="noopener noreferrer">WHATSAPP</a>
                <button class="btn btn--small btn--danger" data-del-id="${c.id}" data-del-name="${c.name}" type="button">EXCLUIR</button>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }

    // Delegação de evento para o botão de exclusão
    listContainer.addEventListener("click", async (e) => {
      const delBtn = e.target.closest("[data-del-id]");
      if (!delBtn) return;

      const id = delBtn.getAttribute("data-del-id");
      const name = delBtn.getAttribute("data-del-name") || "este cliente";

      const confirmed = window.confirm(`Deseja realmente excluir o cadastro de "${name}"?\nEsta ação não poderá ser desfeita.`);
      if (!confirmed) return;

      delBtn.disabled = true;
      const oldText = delBtn.textContent;
      delBtn.textContent = "…";

      const res = await deleteCustomer(id);
      if (res.ok) {
        const card = document.getElementById(`customer-row-${id}`);
        if (card) {
          card.style.transition = "opacity 0.25s ease, transform 0.25s ease";
          card.style.opacity = "0";
          card.style.transform = "translateX(20px)";
          setTimeout(() => {
            card.remove();
            if (!listContainer.querySelector(".customer-card")) {
              listContainer.innerHTML = '<div class="state"><p>Nenhum cliente cadastrado ainda.</p></div>';
            }
          }, 250);
        }
      } else {
        alert("Erro ao excluir: " + res.error);
        delBtn.disabled = false;
        delBtn.textContent = oldText;
      }
    });

    let searchTimer = null;
    searchInput.addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => load(e.target.value.trim()), 300);
    });

    load();
  }

  function handleRoute() {
    const hash = window.location.hash || "#/";
    const nav = document.getElementById("nav");
    if (nav) {
      const links = nav.querySelectorAll("a[data-nav]");
      links.forEach((a) => {
        const t = a.getAttribute("data-nav");
        if (t === "clientes") a.classList.toggle("is-on", hash.startsWith("#/clientes"));
      });
    }

    if (hash.startsWith("#/clientes")) {
      renderView();
    } else if (hash === "#/") {
      setTimeout(async () => {
        const homeCards = document.querySelector(".home__cards");
        if (homeCards && !document.getElementById("card-total-cust")) {
          const total = await countCustomers();
          const card = document.createElement("a");
          card.id = "card-total-cust";
          card.className = "card";
          card.href = "#/clientes";
          card.innerHTML = `
            <strong>${total}</strong>
            <span>Clientes</span>
            <small>Leads captados</small>
          `;
          homeCards.appendChild(card);
        }
      }, 350);
    }
  }

  window.addEventListener("hashchange", handleRoute);
  window.addEventListener("DOMContentLoaded", handleRoute);
})();