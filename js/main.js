/* HL Store — lógica da página: renderização, WhatsApp, "ver mais" e animações */
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

  /* ---------- Criação dos cards ---------- */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createProduct(p, index) {
    const side = index % 2 === 0 ? "left" : "right";
    const article = el("article", "product product--" + side);
    article.setAttribute("aria-labelledby", "produto-" + p.id);

    /* Imagem */
    const media = el("div", "product__media reveal-media");
    const img = document.createElement("img");
    img.src = p.image;
    img.alt = p.name + " — imagem de demonstração da HL Store";
    img.width = 800;
    img.height = 1000;
    img.loading = index < 2 ? "eager" : "lazy";
    img.decoding = "async";
    img.addEventListener("error", function () {
      media.replaceChildren(el("span", "product__badge", "IMAGEM INDISPONÍVEL"));
    });
    media.appendChild(img);
    if (p.featured) media.appendChild(el("span", "product__badge", "DESTAQUE"));

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

    article.append(media, body);
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
