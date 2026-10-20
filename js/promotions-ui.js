/* HL Store — seção de promoções (carrossel abaixo do hero).
   Lê produtos e promoções via window.HL_DATA (js/data/store-data.js). Não mexe no catálogo nem no carrinho. */
(function () {
  "use strict";

  const section = document.getElementById("promocoes");
  const track = document.getElementById("promo-track");
  if (!section || !track) return;

  const PRODUCTS = window.HL_DATA.getProducts();
  const PROMOS = window.HL_DATA.getPromotions();
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Aceita "AAAA-MM-DD" (arquivo local; fim = último momento do dia) ou timestamp ISO (banco) */
  function toTime(value, isEnd) {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const p = value.split("-").map(Number);
      const d = isEnd ? new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999) : new Date(p[0], p[1] - 1, p[2]);
      return d.getTime();
    }
    const t = Date.parse(value);
    return isNaN(t) ? null : t;
  }

  /* Junta promoção + produto e descarta o que não vale (sem produto, sem estoque, fora do prazo, preço inválido) */
  function activeItems() {
    const now = Date.now();
    const seen = {};
    return PROMOS.map(function (promo) {
      const p = PRODUCTS.find(function (x) { return x.id === promo.productId; });
      return p ? { p: p, promo: promo } : null;
    }).filter(function (it) {
      if (!it || !it.p.inStock) return false;
      const { promo, p } = it;
      if (!(promo.promoPrice > 0 && promo.promoPrice < p.price)) return false;
      const start = toTime(promo.startsAt, false), end = toTime(promo.endsAt, true);
      if (start !== null && now < start) return false;
      if (end !== null && now > end) return false;
      if (seen[p.id]) return false; // a mesma promoção nunca aparece duas vezes
      seen[p.id] = true;
      return true;
    });
  }

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function card(it) {
    const { p, promo } = it;
    const off = Math.round((1 - promo.promoPrice / p.price) * 100);

    const li = el("li", "promo-card");
    const a = el("a", "promo-card__link");
    a.href = "#produto-" + p.id;
    a.setAttribute("aria-label", p.name + ", de " + brl.format(p.price) + " por " + brl.format(promo.promoPrice) + ", " + off + "% de desconto");

    const media = el("div", "promo-card__media");
    const img = document.createElement("img");
    img.src = (p.images && p.images[0]) || p.image;
    img.alt = p.name;
    img.width = 800; img.height = 1000;
    img.loading = "lazy"; img.decoding = "async"; img.draggable = false;
    media.append(img, el("span", "promo-card__off", "-" + off + "%"));

    const body = el("div", "promo-card__body");
    const name = el("h3", "promo-card__name", p.name);
    const prices = el("p", "promo-card__prices");
    const old = el("s", "promo-card__old", brl.format(p.price));
    old.setAttribute("aria-hidden", "true");
    prices.append(old, el("strong", "promo-card__now", brl.format(promo.promoPrice)));
    body.append(name, prices);

    a.append(media, body);
    li.appendChild(a);
    return li;
  }

  const items = activeItems();
  if (!items.length) { section.hidden = true; return; }

  items.forEach(function (it) { track.appendChild(card(it)); });

  const demoNote = document.getElementById("promo-demo");
  if (demoNote) demoNote.hidden = !items.some(function (it) { return it.promo.demo; });

  /* ---------- Navegação ---------- */
  const prev = document.getElementById("promo-prev");
  const next = document.getElementById("promo-next");

  function step() {
    const first = track.querySelector(".promo-card");
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return first ? first.getBoundingClientRect().width + gap : track.clientWidth * 0.8;
  }

  function update() {
    const max = track.scrollWidth - track.clientWidth - 2;
    const scrollable = max > 0;
    prev.disabled = track.scrollLeft <= 2;
    next.disabled = track.scrollLeft >= max;
    section.classList.toggle("is-static", !scrollable);
  }

  function go(dir) {
    track.scrollBy({ left: dir * step(), behavior: reduceMotion ? "auto" : "smooth" });
  }

  prev.addEventListener("click", function () { go(-1); });
  next.addEventListener("click", function () { go(1); });
  track.addEventListener("scroll", function () { window.requestAnimationFrame(update); }, { passive: true });
  window.addEventListener("resize", update);
  /* Teclado: setas com foco na lista */
  track.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  });
  update();

  /* Animação de entrada (mesmo padrão .reveal do site) */
  const targets = section.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    targets.forEach(function (t) { io.observe(t); });
  } else {
    targets.forEach(function (t) { t.classList.add("is-visible"); });
  }
})();
