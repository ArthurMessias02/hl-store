/* HL Store — inicialização.
   Espera os dados (HL_DATA.ready) e só então carrega, NA ORDEM, os scripts que
   desenham a loja. Assim a vitrine, o carrinho e as promoções já nascem com os
   dados certos (do banco, ou locais se o banco estiver fora do ar). */
(function () {
  "use strict";

  const SCRIPTS = ["js/cart.js", "js/coupons.js", "js/main.js", "js/promotions-ui.js", "js/cart-ui.js"];

  function loadAll() {
    SCRIPTS.forEach(function (src) {
      const s = document.createElement("script");
      s.src = src;
      s.async = false; // preserva a ordem de execução
      document.body.appendChild(s);
    });
  }

  window.HL_DATA.ready.then(loadAll, loadAll);
})();
