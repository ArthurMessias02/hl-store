/* HL Store — lógica da página: renderização, galeria de fotos, WhatsApp, "ver mais" e animações */
(function () {
  "use strict";

  const CONFIG = window.HL_CONFIG;
  const PRODUCTS = window.HL_PRODUCTS || [];

  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  /* ---------- WhatsApp ---------- */
  function whatsappLink(message) {
    return "https://wa.me/" + CONFIG.whatsappNumber + "?text=" + encodeURIComponent(message);
  }

  function productMessage(p) {
    if (p.inStock) {
      return "Olá! Tenho interesse na " + p.name + " da " + CONFIG.brandName + ". Gostaria de consultar os tamanhos disponíveis.";
    }
    return "Olá! Vi que a " + p.name + " da " + CONFIG.brandName + " está indisponível no site. Gostaria de consultar se haverá reposição ou alternativas.";
  }

  /* ---------- Utilitários ---------- */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- Galeria de fotos do produto ---------- */
  function getPhotos(p) {
    return p.images && p.images.length ? p.images : [p.image];
  }

  function photoAlt(p, n, total) {
    return total > 1 ? p.name + " — foto " + (n + 1) + " de " + total : p.name;
  }

  /* HTML do bloco de mídia (foto grande + setas + miniaturas) */
  function galleryHTML(p, index) {
    const fotos = getPhotos(p);
    const multi = fotos.length > 1;
    const loading = index < 2 ? "eager" : "lazy";

    return `
      <div class="product__gallery" data-gallery data-id="${esc(p.id)}">
        <div class="product__media">
          ${p.featured ? '<span class="product__badge">DESTAQUE</span>' : ""}
          <img class="gallery__img" src="${esc(fotos[0])}" alt="${esc(photoAlt(p, 0, fotos.length))}" width="800" height="1000" loading="${loading}" decoding="async" draggable="false">
          ${multi ? `
            <button class="gallery__arrow gallery__arrow--prev" type="button" aria-label="Foto anterior">‹</button>
            <button class="gallery__arrow gallery__arrow--next" type="button" aria-label="Próxima foto">›</button>` : ""}
        </div>
        ${multi ? `
          <div class="gallery__thumbs">
            ${fotos.map(function (src, i) {
              return `
              <button class="gallery__thumb ${i === 0 ? "is-active" : ""}" type="button" data-i="${i}" aria-label="Ver foto ${i + 1}">
                <img src="${esc(src)}" alt="" loading="lazy" draggable="false">
              </button>`;
            }).join("")}
          </div>` : ""}
      </div>`;
  }

  /* Liga o comportamento: setas, miniaturas e swipe */
  function initGalleries(root) {
    root.querySelectorAll("[data-gallery]").forEach(function (g) {
      const p = PRODUCTS.find(function (x) { return String(x.id) === g.dataset.id; });
      if (!p) return;

      const fotos = getPhotos(p);
      if (fotos.length < 2) return;

      const stage = g.querySelector(".product__media");
      const img = g.querySelector(".gallery__img");
      const prev = g.querySelector(".gallery__arrow--prev");
      const next = g.querySelector(".gallery__arrow--next");
      const thumbs = Array.prototype.slice.call(g.querySelectorAll(".gallery__thumb"));
      if (!stage || !img) return;

      let atual = 0;

      function ir(n) {
        atual = (n + fotos.length) % fotos.length;
        img.classList.add("is-changing");
        img.onload = img.onerror = function () { img.classList.remove("is-changing"); };
        img.src = fotos[atual];
        img.alt = photoAlt(p, atual, fotos.length);
        thumbs.forEach(function (t, k) { t.classList.toggle("is-active", k === atual); });
      }

      if (prev) prev.addEventListener("click", function () { ir(atual - 1); });
      if (next) next.addEventListener("click", function () { ir(atual + 1); });
      thumbs.forEach(function (t) {
        t.addEventListener("click", function () { ir(Number(t.dataset.i)); });
      });

      /* swipe (dedo ou mouse) */
      let x0 = null;
      stage.addEventListener("pointerdown", function (e) {
        if (!e.target.closest("button")) x0 = e.clientX;
      });
      stage.addEventListener("pointerup", function (e) {
        if (x0 === null) return;
        const dif = e.clientX - x0;
        x0 = null;
        if (Math.abs(dif) > 40) ir(atual + (dif < 0 ? 1 : -1));
      });
      stage.addEventListener("pointercancel", function () { x0 = null; });
    });
  }

  /* ---------- Criação dos cards ---------- */
  function createProduct(p, index) {
    const side = index % 2 === 0 ? "left" : "right";
    const article = el("article", "product product--" + side);
    article.setAttribute("aria-labelledby", "produto-" + p.id);

    /* Imagem / galeria */
    const holder = document.createElement("div");
    holder.innerHTML = galleryHTML(p, index).trim();
    const gallery = holder.firstElementChild;
    const media = gallery.querySelector(".product__media");
    media.classList.add("reveal-media");

    const firstImg = gallery.querySelector(".gallery__img");
    function onFirstError() {
      media.replaceChildren(el("span", "product__badge", "IMAGEM INDISPONÍVEL"));
    }
    firstImg.addEventListener("error", onFirstError, { once: true });
    firstImg.addEventListener("load", function () {
      firstImg.removeEventListener("error", onFirstError);
    }, { once: true });

    /* Texto */
    const body = el("div", "product__body");
    const idx = el("p", "product__index reveal", String(index + 1).padStart(2, "0") + " / " + String(PRODUCTS.length).padStart(2, "0"));
    const name = el("h3", "product__name reveal", p.name);
    name.id = "produto-" + p.id;
    name.style.setProperty("--d", "80ms");
    const desc = el("p", "product__desc reveal", p.description);
    desc.style.setProperty("--d", "160ms");
    const price = el("p", "product__price reveal", brl.format(p.price));
    price.style.setProperty("--d", "240ms");

    const sizesWrap = el("div", "reveal");
    sizesWrap.style.setProperty("--d", "320ms");
    const sizesLabel = el("p", "product__sizes-label", "Tamanhos");
    sizesLabel.id = "tam-" + p.id;
    const sizes = el("ul", "product__sizes");
    sizes.setAttribute("aria-labelledby", sizesLabel.id);
    p.sizes.forEach(function (s) { sizes.appendChild(el("li", "", s)); });
    sizesWrap.append(sizesLabel, sizes);

    const status = el("p", "status reveal " + (p.inStock ? "status--in" : "status--out"), p.inStock ? "EM ESTOQUE" : "INDISPONÍVEL");
    status.style.setProperty("--d", "400ms");

    const cta = document.createElement("a");
    cta.className = "btn product__cta reveal " + (p.inStock ? "btn--primary" : "btn--ghost btn--disabled-look");
    cta.style.setProperty("--d", "480ms");
    cta.href = whatsappLink(productMessage(p));
    cta.target = "_blank";
    cta.rel = "noopener noreferrer";
    cta.textContent = p.inStock ? "CONSULTAR NO WHATSAPP" : "CONSULTAR REPOSIÇÃO";
    cta.setAttribute("aria-label", (p.inStock ? "Consultar no WhatsApp: " : "Consultar reposição no WhatsApp: ") + p.name);

    body.append(idx, name, desc, price, sizesWrap, status, cta);
    if (!p.inStock) {
      const note = el("p", "product__note reveal", "Peça indisponível no momento. O botão abre uma consulta, não uma compra.");
      note.style.setProperty("--d", "560ms");
      body.appendChild(note);
    }

    article.append(gallery, body);
    return article;
  }

  /* ---------- Animações (IntersectionObserver) ---------- */
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let observer = null;

  if ("IntersectionObserver" in window && !reduceMotion) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  }

  function observe(root) {
    const targets = root.querySelectorAll(".reveal, .reveal-media");
    targets.forEach(function (t) {
      if (observer) observer.observe(t);
      else t.classList.add("is-visible");
    });
  }

  /* ---------- Renderização ---------- */
  const mainBox = document.getElementById("products-main");
  const extraBox = document.getElementById("products-extra");
  const toggleBtn = document.getElementById("toggle-more");
  const limit = CONFIG.initialVisible;

  PRODUCTS.forEach(function (p, i) {
    (i < limit ? mainBox : extraBox).appendChild(createProduct(p, i));
  });

  initGalleries(document);

  if (PRODUCTS.length <= limit) {
    toggleBtn.parentElement.hidden = true;
  }

  /* Observa os elementos já visíveis na página (extras só quando abertos) */
  observe(document);
  extraBox.querySelectorAll(".reveal, .reveal-media").forEach(function (t) {
    if (observer) observer.unobserve(t);
  });

  toggleBtn.addEventListener("click", function () {
    const opening = extraBox.hidden;
    if (opening) {
      extraBox.hidden = false;
      observe(extraBox);
      toggleBtn.textContent = "VER MENOS";
      toggleBtn.setAttribute("aria-expanded", "true");
    } else {
      extraBox.hidden = true;
      toggleBtn.textContent = "VER MAIS PEÇAS";
      toggleBtn.setAttribute("aria-expanded", "false");
      document.getElementById("catalogo").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "end" });
    }
  });

  /* ---------- Configurações gerais (links, textos, ano) ---------- */
  const generalWa = whatsappLink(CONFIG.generalMessage);
  ["contact-wa", "footer-wa"].forEach(function (id) {
    const a = document.getElementById(id);
    if (a) a.href = generalWa;
  });
  const ig = document.getElementById("footer-ig");
  if (ig) ig.href = CONFIG.instagramUrl;

  ["brand-sub", "footer-sub"].forEach(function (id) {
    const n = document.getElementById(id);
    if (n) n.textContent = CONFIG.brandSub;
  });
  const fname = document.getElementById("footer-name");
  if (fname) fname.textContent = CONFIG.brandName;
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();
})();
