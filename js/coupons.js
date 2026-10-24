
/**
 * HL Store — CUPOM NO CARRINHO (window.HLCoupons)
 * ------------------------------------------------------------
 * O banco é responsável por validar e calcular os descontos.
 * O navegador envia os itens do carrinho e exibe a resposta.
 *
 * Estados:
 * idle      nenhum cupom
 * checking  consultando o banco
 * applied   cupom válido
 * invalid   cupom recusado
 * error     falha de conexão ou inconsistência de preços
 */
(function (root) {
  "use strict";

  const SB = (root.HL_CONFIG && root.HL_CONFIG.supabase) || {};
  const BASE = String(SB.url || "").replace(/\/+$/, "");
  const ANON = SB.anonKey || "";
  const enabled = !!(BASE && ANON);

  const KEY_CODE = "hl-store-coupon";
  const KEY_CLIENT = "hl-store-client-id";
  const TIMEOUT_MS = 9000;

  const state = {
    code: "",
    status: "idle",
    message: "",
    reason: "",
    result: null
  };

  const CART_DEPENDENT = {
    min_purchase: true,
    not_eligible: true,
    empty_cart: true
  };

  const listeners = [];
  let seq = 0;
  let timer = null;

  // Armazenamento local com tratamento de erros.
  function store(key, value) {
    try {
      if (value === null) {
        root.localStorage.removeItem(key);
      } else {
        root.localStorage.setItem(key, value);
      }
    } catch (e) {
      // O funcionamento continua durante a visita atual.
    }
  }

  function load(key) {
    try {
      return root.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function uuid() {
    if (root.crypto && root.crypto.randomUUID) {
      return root.crypto.randomUUID();
    }

    const h = "0123456789abcdef";

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = Math.floor(Math.random() * 16);
        return c === "x" ? r : (r & 3) | 8;
      }
    );
  }

  let memoryClientId = null;

  function clientId() {
    let id = load(KEY_CLIENT);

    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = memoryClientId || uuid();
      store(KEY_CLIENT, id);
    }

    memoryClientId = id;
    return id;
  }

  // Normaliza o código do cupom.
  function normalizeCode(raw) {
    return String(raw == null ? "" : raw)
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .toUpperCase()
      .slice(0, 32);
  }

  function notify() {
    listeners.slice().forEach(function (fn) {
      fn(state);
    });
  }

  function set(patch) {
    Object.assign(state, patch);
    notify();
  }

  function headers() {
    const h = {
      "Content-Type": "application/json",
      apikey: ANON
    };

    if (/^eyJ/.test(ANON)) {
      h.Authorization = "Bearer " + ANON;
    }

    return h;
  }

  // Chamada às funções RPC do Supabase.
  function rpc(name, body) {
    const ctl =
      typeof AbortController === "function"
        ? new AbortController()
        : null;

    const t = setTimeout(function () {
      if (ctl) ctl.abort();
    }, TIMEOUT_MS);

    return fetch(BASE + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: ctl ? ctl.signal : undefined
    })
      .then(function (res) {
        clearTimeout(t);

        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }

        return res.json();
      })
      .catch(function (err) {
        clearTimeout(t);
        throw err;
      });
  }

  // Envia apenas identificador e quantidade de cada produto.
  function items() {
    const Cart = root.HLCart;

    return Cart
      ? Cart.lines().map(function (l) {
          return {
            id: l.id,
            qty: l.qty
          };
        })
      : [];
  }

  function cartSubtotal() {
    return root.HLCart ? root.HLCart.totalCents() : 0;
  }

  // Interpreta a resposta do banco.
  function interpret(code, result, mySeq) {
    if (mySeq !== seq) return state;

    if (!result || typeof result !== "object") {
      set({
        status: "error",
        message: "Resposta inesperada do servidor. Tente de novo.",
        result: null
      });

      return state;
    }

    if (result.ok === true) {
      if (result.subtotal_cents !== cartSubtotal()) {
        set({
          status: "error",
          result: null,
          message:
            "Os preços mudaram desde que esta página abriu. " +
            "Recarregue a página para aplicar o cupom."
        });

        return state;
      }

      store(KEY_CODE, code);

      set({
        code: code,
        status: "applied",
        message: "",
        reason: "",
        result: result
      });
    } else {
      if (!CART_DEPENDENT[result.reason]) {
        store(KEY_CODE, null);
      }

      set({
        code: code,
        status: "invalid",
        message: result.message || "Cupom indisponível.",
        reason: result.reason || "",
        result: null
      });
    }

    return state;
  }

  // Valida o cupom no Supabase.
  function validate(code) {
    const mySeq = ++seq;

    set({
      code: code,
      status: "checking",
      message: "",
      reason: "",
      result: null
    });

    return rpc("validate_coupon", {
      p_code: code,
      p_items: items()
    }).then(
      function (r) {
        return interpret(code, r, mySeq);
      },
      function () {
        if (mySeq !== seq) return state;

        set({
          status: "error",
          result: null,
          message:
            "Não foi possível validar o cupom agora. " +
            "Verifique a conexão e tente de novo."
        });

        return state;
      }
    );
  }

  // API pública para aplicar um cupom.
  function apply(raw) {
    const code = normalizeCode(raw);

    if (!enabled) {
      set({
        code: code,
        status: "error",
        message: "Cupons indisponíveis no momento.",
        result: null
      });

      return Promise.resolve(state);
    }

    if (!code) {
      set({
        code: "",
        status: "invalid",
        message: "Digite o código do cupom.",
        result: null
      });

      return Promise.resolve(state);
    }

    if (!items().length) {
      set({
        code: code,
        status: "invalid",
        message: "Adicione peças ao carrinho para usar o cupom.",
        result: null
      });

      return Promise.resolve(state);
    }

    return validate(code);
  }

  function remove() {
    seq++;
    clearTimeout(timer);
    store(KEY_CODE, null);

    set({
      code: "",
      status: "idle",
      message: "",
      reason: "",
      result: null
    });
  }

  // Desconto em centavos, válido para o carrinho atual.
  function discountCents() {
    if (state.status !== "applied" || !state.result) {
      return 0;
    }

    if (state.result.subtotal_cents !== cartSubtotal()) {
      return 0;
    }

    return state.result.discount_cents;
  }

  function refresh() {
    if (!state.code || state.status === "idle") {
      return Promise.resolve(state);
    }

    if (!items().length) {
      remove();
      return Promise.resolve(state);
    }

    return validate(state.code);
  }

  /**
   * Reconfere e reserva o cupom ao enviar o pedido.
   * Reservar não significa que a compra foi confirmada.
   */
  function reserve() {
    if (!state.code) {
      return Promise.resolve({
        ok: false,
        message: "Nenhum cupom aplicado."
      });
    }

    const code = state.code;

    // CORREÇÃO: o parâmetro corresponde à função SQL existente.
    return rpc("reserve_coupon", {
      p_code: code,
      p_items: items(),
      p_anon_id: clientId()
    }).then(
      function (r) {
        if (r && r.ok === true && r.order_ref) {
          if (r.subtotal_cents !== cartSubtotal()) {
            return {
              ok: false,
              message:
                "Os preços mudaram. Recarregue a página e tente de novo."
            };
          }

          set({
            code: code,
            status: "applied",
            message: "",
            result: r
          });

          return {
            ok: true,
            orderRef: r.order_ref,
            discountCents: r.discount_cents,
            code: r.code
          };
        }

        const message =
          (r && r.message) ||
          "Não foi possível reservar o cupom.";

        set({
          code: code,
          status: "invalid",
          message: message,
          reason: (r && r.reason) || "",
          result: null
        });

        return {
          ok: false,
          message: message
        };
      },
      function () {
        return {
          ok: false,
          network: true,
          message:
            "Não foi possível confirmar o cupom agora. " +
            "Tente de novo ou remova o cupom para enviar " +
            "o pedido sem desconto."
        };
      }
    );
  }

  function subscribe(fn) {
    listeners.push(fn);
  }

  // Revalida o cupom quando o carrinho muda.
  function onCartChange() {
    if (!state.code || state.status === "idle") return;

    if (
      state.status === "invalid" &&
      !CART_DEPENDENT[state.reason]
    ) {
      return;
    }

    clearTimeout(timer);

    if (!items().length) {
      remove();
      return;
    }

    ++seq;

    set({
      status: "checking",
      message: "",
      reason: "",
      result: null
    });

    timer = setTimeout(function () {
      validate(state.code);
    }, 300);
  }

  function init() {
    if (root.HLCart) {
      root.HLCart.subscribe(onCartChange);
    }

    const saved = normalizeCode(load(KEY_CODE));

    if (enabled && saved && items().length) {
      validate(saved);
    } else if (saved && !items().length) {
      store(KEY_CODE, null);
    }
  }

  root.HLCoupons = {
    enabled: enabled,
    state: state,
    normalizeCode: normalizeCode,
    apply: apply,
    remove: remove,
    refresh: refresh,
    reserve: reserve,
    discountCents: discountCents,
    subscribe: subscribe
  };

  init();
})(typeof window !== "undefined" ? window : globalThis);
