/**
 * CLIENTE DO SUPABASE (só para o painel) — HLAdmin.client
 * ------------------------------------------------------------
 * Fala com 3 serviços do Supabase usando apenas fetch (sem biblioteca externa):
 *   /auth/v1     -> LOGIN (valida e-mail e senha, entrega o "token" da sessão)
 *   /rest/v1     -> BANCO (ler/gravar tabelas; o banco confere o token e aplica o RLS)
 *   /storage/v1  -> FOTOS (enviar/apagar imagens)
 *
 * Como a segurança funciona:
 *  - Toda requisição leva a chave pública "anon" (apikey) e o token do usuário logado.
 *  - Quem decide se a gravação é permitida é o BANCO (regras RLS em db/schema.sql),
 *    não este arquivo. Se alguém alterar este JS no navegador, o banco continua recusando.
 *  - O token da sessão fica no localStorage do navegador do dono (é uma credencial
 *    TEMPORÁRIA do usuário, não uma senha nem uma chave do projeto).
 */

(function () {




  "use strict";

  const CFG = (window.HL_CONFIG && window.HL_CONFIG.supabase) || {};
  const BASE = String(CFG.url || "").replace(/\/+$/, "");
  const ANON = CFG.anonKey || "";
  const BUCKET = "product-images";
  const SESSION_KEY = "hl-admin-session";

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.name = "ApiError";
      this.status = status || 0;
      this.code = code || "";
    }
  }

  function isConfigured() { return !!(BASE && ANON); }

  /* ---------- Sessão (token do usuário) ---------- */
  let memorySession = null; // plano B se o navegador bloquear o localStorage
  const listeners = [];

  function readSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignora */ }
    return memorySession;
  }
  function writeSession(s) {
    memorySession = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignora */ }
  }
  function endSession(reason) {
    const had = !!readSession();
    writeSession(null);
    if (had) listeners.forEach(function (fn) { fn(reason); });
  }
  function onSessionEnd(fn) { listeners.push(fn); }

  function errorMessage(body, status) {
    if (body && typeof body === "object") {
      return body.message || body.msg || body.error_description || (typeof body.error === "string" ? body.error : "") || ("Erro " + status);
    }
    return "Erro " + status;
  }

  function networkError() {
    return new ApiError("Sem conexão com o servidor. Verifique a internet e tente de novo.", 0, "network");
  }

  /* Cabeçalho Authorization: o token do usuário logado, ou (sem login) a chave anon SE ela for um JWT.
     A chave nova "sb_publishable_..." NÃO é JWT e vai só no cabeçalho apikey. */
  function bearer(token) {
    if (token) return { Authorization: "Bearer " + token };
    if (/^eyJ/.test(ANON)) return { Authorization: "Bearer " + ANON };
    return {};
  }

  /* ---------- Requisição genérica ---------- */
  function rawFetch(path, opts) {
    return fetch(BASE + path, opts).catch(function () { throw networkError(); });
  }

  async function parse(res) {
    const text = await res.text();
    let body = null;
    if (text) { try { body = JSON.parse(text); } catch (e) { body = text; } }
    return body;
  }

  let refreshing = null;
  function refresh() {
    if (refreshing) return refreshing; // evita renovar duas vezes ao mesmo tempo
    const s = readSession();
    if (!s || !s.refresh_token) { endSession("expired"); return Promise.reject(new ApiError("Sessão expirada.", 401, "expired")); }
    refreshing = rawFetch("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    }).then(async function (res) {
      const body = await parse(res);
      if (!res.ok) { endSession("expired"); throw new ApiError("Sessão expirada. Entre novamente.", 401, "expired"); }
      writeSession(toSession(body));
      return readSession();
    }).finally(function () { refreshing = null; });
    return refreshing;
  }

  function toSession(body) {
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: body.expires_at || Math.floor(Date.now() / 1000) + (body.expires_in || 3600),
      user: { id: body.user && body.user.id, email: body.user && body.user.email },
    };
  }

  /* Devolve um token válido (renova um pouco antes de vencer) */
  async function accessToken() {
    let s = readSession();
    if (!s) return null;
    if (s.expires_at - 30 <= Math.floor(Date.now() / 1000)) s = await refresh();
    return s.access_token;
  }

  async function request(path, opts, retried) {
    const token = await accessToken();
    const headers = Object.assign({ apikey: ANON }, bearer(token), opts.headers || {});
    const res = await rawFetch(path, Object.assign({}, opts, { headers: headers }));
    if (res.status === 401 && token && !retried) {
      // token recusado: tenta renovar uma vez e repete
      await refresh();
      return request(path, opts, true);
    }
    const body = await parse(res);
    if (!res.ok) {
      if (res.status === 401) endSession("expired");
      throw new ApiError(errorMessage(body, res.status), res.status, body && (body.code || body.error_code) || "");
    }
    return body;
  }

  /* ---------- AUTH ---------- */
  const auth = {
    async signIn(email, password) {
      const res = await rawFetch("/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { apikey: ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ email: email, password: password }),
      });
      const body = await parse(res);
      if (!res.ok) {
        if (res.status === 429) throw new ApiError("Muitas tentativas. Aguarde alguns minutos e tente de novo.", 429);
        if (res.status === 400 || res.status === 401 || res.status === 422) throw new ApiError("E-mail ou senha incorretos.", res.status, "invalid_credentials");
        throw new ApiError(errorMessage(body, res.status), res.status);
      }
      writeSession(toSession(body));
      return readSession();
    },
    async signOut() {
      const s = readSession();
      writeSession(null); // sai do navegador primeiro, aconteça o que acontecer
      if (s) {
        // avisa o servidor para encerrar esta sessão (se falhar, o token ainda vence sozinho)
        try {
          await fetch(BASE + "/auth/v1/logout?scope=local", { method: "POST", headers: { apikey: ANON, Authorization: "Bearer " + s.access_token } });
        } catch (e) { /* ignora */ }
      }
    },
    getSession: readSession,
    /** O usuário logado é administrador? (o banco só devolve a PRÓPRIA linha) */
    async isAdmin() {
      const s = readSession();
      if (!s) return false;
      const rows = await rest.select("admin_users", { select: "user_id", user_id: "eq." + s.user.id });
      return rows.length === 1;
    },
  };

  /* ---------- BANCO (PostgREST) ---------- */
  function qs(params) {
    const u = new URLSearchParams();
    Object.keys(params || {}).forEach(function (k) { u.append(k, params[k]); });
    const s = u.toString();
    return s ? "?" + s : "";
  }

  const rest = {
    select: function (table, params) {
      return request("/rest/v1/" + table + qs(params), { method: "GET" });
    },
    insert: function (table, rows) {
      return request("/rest/v1/" + table, {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(rows),
      });
    },
    /** Atualiza as linhas que combinam com `match` (ex.: {id: "eq.123"}). Devolve as linhas alteradas. */
    update: async function (table, match, patch) {
      const rows = await request("/rest/v1/" + table + qs(match), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(patch),
      });
      if (!rows.length) throw new ApiError("Não foi possível salvar: item não encontrado ou sem permissão.", 403, "no_rows");
      return rows;
    },
    /** Chama uma função do banco (POST /rest/v1/rpc/<nome>) com a sessão do admin. */
    rpc: function (name, args) {
      return request("/rest/v1/rpc/" + name, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args || {}),
      });
    },
    remove: async function (table, match) {
      const rows = await request("/rest/v1/" + table + qs(match), { method: "DELETE", headers: { Prefer: "return=representation" } });
      if (!rows.length) throw new ApiError("Não foi possível excluir: item não encontrado ou sem permissão.", 403, "no_rows");
      return rows;
    },
  };

  /* ---------- STORAGE (fotos) ---------- */
  function encodePath(p) { return p.split("/").map(encodeURIComponent).join("/"); }

  const storage = {
    async upload(path, blob) {
      const form = new FormData();
      form.append("cacheControl", "31536000");
      form.append("", blob, "foto"); // mesmo formato que a biblioteca oficial usa
      await request("/storage/v1/object/" + BUCKET + "/" + encodePath(path), { method: "POST", headers: { "x-upsert": "false" }, body: form });
      return path;
    },
    async remove(paths) {
      if (!paths.length) return;
      await request("/storage/v1/object/" + BUCKET, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      });
    },
    /** Caminho legado da loja (assets/...) fica relativo à raiz; o resto vem do Storage */
    publicUrl(path) {
      if (/^(https?:)?\/\//.test(path)) return path;
      if (path.indexOf("assets/") === 0) return "../" + path;
      return BASE + "/storage/v1/object/public/" + BUCKET + "/" + encodePath(path);
    },
    isStoragePath: function (path) { return !/^(https?:)?\/\//.test(path) && path.indexOf("assets/") !== 0; },
  };

  window.HLAdmin = window.HLAdmin || {};
  window.HLAdmin.client = { isConfigured: isConfigured, auth: auth, rest: rest, storage: storage, onSessionEnd: onSessionEnd, ApiError: ApiError };
})();
