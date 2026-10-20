/**
 * REGRAS DO PAINEL — HLAdmin.data
 * ------------------------------------------------------------
 * Aqui ficam as "receitas": validar o formulário, preparar a foto, gravar no banco
 * e manter tudo consistente. As telas (views.js) só chamam estas funções.
 * Segunda camada de proteção: o banco também valida tudo (db/schema.sql).
 */
(function () {
  "use strict";

  const C = window.HLAdmin.client;
  const U = window.HLAdmin.ui;
  const MAX_PHOTOS = 8;
  const MAX_SIDE = 1600; // px: lado maior da foto depois de reduzida

  function eq(v) { return "eq." + v; }

  /* =============== FOTOS: reduzir antes de enviar =============== */
  async function loadBitmap(file) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* tenta o plano B */ }
    }
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Não foi possível abrir esta imagem.")); };
      img.src = url;
    });
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
  }

  /** Reduz a foto do celular (vários MB) para ~1600 px em WebP (ou JPEG se o aparelho não gerar WebP). */
  async function prepareImage(file) {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      throw new Error("Formato não aceito. Use JPG, PNG ou WebP.");
    }
    const bmp = await loadBitmap(file);
    const w = bmp.width, hgt = bmp.height;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, hgt));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale); canvas.height = Math.round(hgt * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    let blob = await toBlob(canvas, "image/webp", 0.85), ext = "webp";
    if (!blob || blob.type !== "image/webp") { blob = await toBlob(canvas, "image/jpeg", 0.85); ext = "jpg"; }
    if (!blob) throw new Error("Não foi possível processar esta imagem.");
    if (blob.size > 5 * 1024 * 1024) throw new Error("A foto continua grande demais (limite 5 MB).");
    return { blob: blob, ext: ext, previewUrl: URL.createObjectURL(blob) };
  }

  function newPath(ext) {
    const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    return "products/" + id + "." + ext;
  }

  /* =============== CATEGORIAS =============== */
  function listCategories() {
    return C.rest.select("categories", { select: "id,name,slug", order: "sort_order.asc,name.asc" });
  }

  function slugify(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "categoria";
  }

  async function ensureCategory(name) {
    const slug = slugify(name);
    const found = await C.rest.select("categories", { select: "id,name,slug", slug: eq(slug) });
    if (found.length) return found[0];
    const rows = await C.rest.insert("categories", { slug: slug, name: name.trim() });
    return rows[0];
  }

  /* =============== PRODUTOS =============== */
  async function listProducts() {
    const out = await Promise.all([
      C.rest.select("products", { select: "*", order: "sort_order.asc,created_at.asc" }),
      C.rest.select("product_images", { select: "id,product_id,path,sort_order", order: "sort_order.asc" }),
      C.rest.select("promotions", { select: "*" }),
    ]);
    const imgs = {};
    out[1].forEach(function (im) { (imgs[im.product_id] = imgs[im.product_id] || []).push(im); });
    const promos = {};
    out[2].forEach(function (p) { promos[p.product_id] = p; });
    return out[0].map(function (p) {
      p.price = Number(p.price);
      p.images = imgs[p.id] || [];
      p.promo = promos[p.id] ? withPromoNumbers(promos[p.id]) : null;
      return p;
    });
  }

  async function getProduct(id) {
    const all = await listProducts();
    return all.find(function (p) { return p.id === id; }) || null;
  }

  function validateProduct(f) {
    const e = {};
    const name = f.name.trim();
    if (name.length < 2) e.name = "Informe o nome do produto (mínimo 2 letras).";
    else if (name.length > 80) e.name = "Nome muito longo (máximo 80 caracteres).";
    if (f.description.trim().length > 600) e.description = "Descrição muito longa (máximo 600 caracteres).";
    if (isNaN(f.price) || f.price <= 0) e.price = "Informe um preço válido, ex.: 89,90.";
    else if (f.price > 100000) e.price = "Preço alto demais. Confira o valor.";
    if (!f.sizes.length) e.sizes = "Escolha pelo menos um tamanho.";
    if (f.images.length > MAX_PHOTOS) e.images = "No máximo " + MAX_PHOTOS + " fotos por produto.";
    else if (f.visible && f.images.length < 1) e.images = "Adicione pelo menos uma foto para deixar o produto visível na loja.";
    return e;
  }

  async function nextSortOrder() {
    const rows = await C.rest.select("products", { select: "sort_order", order: "sort_order.desc", limit: "1" });
    return rows.length ? rows[0].sort_order + 1 : 0;
  }

  /**
   * form: { name, description, categoryId, newCategory, price, sizes[], inStock, featured, visible,
   *         images: [{ id, path } (já salva) | { blob, ext } (nova)] }
   */
  async function saveProduct(form, existing) {
    const uploaded = []; // caminhos enviados agora (apagados se algo falhar)
    try {
      let categoryId = form.categoryId || null;
      if (form.newCategory && form.newCategory.trim()) categoryId = (await ensureCategory(form.newCategory)).id;

      const fields = {
        name: form.name.trim(), description: form.description.trim(), price: form.price,
        sizes: form.sizes, in_stock: form.inStock, featured: form.featured,
        category_id: categoryId, status: form.visible ? "published" : "hidden",
      };

      // 1) envia as fotos novas
      const finalImages = [];
      for (const im of form.images) {
        if (im.blob) { const p = newPath(im.ext); await C.storage.upload(p, im.blob); uploaded.push(p); finalImages.push({ path: p, isNew: true }); }
        else finalImages.push({ id: im.id, path: im.path, isNew: false });
      }

      // 2) grava o produto
      let productId;
      if (existing) {
        await C.rest.update("products", { id: eq(existing.id) }, fields);
        productId = existing.id;
      } else {
        fields.sort_order = await nextSortOrder();
        const rows = await C.rest.insert("products", fields);
        productId = rows[0].id;
      }

      // 3) sincroniza as fotos (remove, adiciona e reordena)
      try {
        const keptIds = finalImages.filter(function (i) { return !i.isNew; }).map(function (i) { return i.id; });
        const removed = existing ? existing.images.filter(function (i) { return keptIds.indexOf(i.id) === -1; }) : [];
        for (const r of removed) await C.rest.remove("product_images", { id: eq(r.id) });
        const toInsert = [];
        for (let i = 0; i < finalImages.length; i++) {
          const im = finalImages[i];
          if (im.isNew) toInsert.push({ product_id: productId, path: im.path, alt: fields.name, sort_order: i });
          else {
            const old = existing.images.find(function (x) { return x.id === im.id; });
            if (old && old.sort_order !== i) await C.rest.update("product_images", { id: eq(im.id) }, { sort_order: i });
          }
        }
        if (toInsert.length) await C.rest.insert("product_images", toInsert);
        // só apaga os arquivos antigos depois que o banco já não aponta para eles
        const gone = removed.map(function (r) { return r.path; }).filter(C.storage.isStoragePath);
        if (gone.length) { try { await C.storage.remove(gone); } catch (e) { /* sobra de arquivo não afeta a loja */ } }
      } catch (e) {
        if (!existing) { try { await C.rest.remove("products", { id: eq(productId) }); } catch (x) { /* ignora */ } }
        throw e;
      }
      return productId;
    } catch (e) {
      if (uploaded.length) { try { await C.storage.remove(uploaded); } catch (x) { /* ignora */ } }
      throw e;
    }
  }

  async function setProductVisible(p, visible) {
    if (visible && !p.images.length) throw new Error("Adicione uma foto antes de deixar o produto visível.");
    await C.rest.update("products", { id: eq(p.id) }, { status: visible ? "published" : "hidden" });
  }

  async function deleteProduct(p) {
    const files = p.images.map(function (i) { return i.path; }).filter(C.storage.isStoragePath);
    await C.rest.remove("products", { id: eq(p.id) }); // apaga também fotos (linhas) e a promoção, por CASCADE
    if (files.length) { try { await C.storage.remove(files); } catch (e) { /* ignora */ } }
  }

  /* =============== PROMOÇÕES =============== */
  function withPromoNumbers(p) { p.promo_price = Number(p.promo_price); return p; }

  function discountPct(original, promo) { return Math.round((1 - promo / original) * 100); }

  function promoStatus(p, now) {
    const t = now || Date.now();
    if (!p.is_active) return { key: "inactive", label: "Inativa" };
    if (p.ends_at && Date.parse(p.ends_at) < t) return { key: "expired", label: "Vencida" };
    if (p.starts_at && Date.parse(p.starts_at) > t) return { key: "scheduled", label: "Agendada" };
    return { key: "active", label: "Ativa" };
  }

  async function listPromotions() {
    const products = await listProducts();
    const rows = await C.rest.select("promotions", { select: "*", order: "sort_order.asc,created_at.desc" });
    return { products: products, promotions: rows.map(withPromoNumbers).map(function (p) {
      p.product = products.find(function (x) { return x.id === p.product_id; }) || null;
      return p;
    }) };
  }

  /** "AAAA-MM-DD" <-> timestamp (início do dia / fim do dia, no fuso do celular do dono) */
  function dateToStart(v) { if (!v) return null; const p = v.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2], 0, 0, 0).toISOString(); }
  function dateToEnd(v) { if (!v) return null; const p = v.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2], 23, 59, 59).toISOString(); }
  function isoToDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function validatePromotion(f, product) {
    const e = {};
    if (!product) e.product = "Escolha o produto da promoção.";
    if (isNaN(f.promoPrice) || f.promoPrice <= 0) e.promoPrice = "Informe o preço promocional, ex.: 74,90.";
    else if (product && f.promoPrice >= product.price) e.promoPrice = "O preço promocional precisa ser menor que o preço normal (" + U.brl(product.price) + ").";
    if (f.startDate && f.endDate && f.endDate < f.startDate) e.endDate = "O término não pode ser antes do início.";
    return e;
  }

  async function savePromotion(f, existingId) {
    const row = { promo_price: f.promoPrice, starts_at: dateToStart(f.startDate), ends_at: dateToEnd(f.endDate), is_active: f.active };
    try {
      if (existingId) return (await C.rest.update("promotions", { id: eq(existingId) }, row))[0];
      row.product_id = f.productId;
      return (await C.rest.insert("promotions", row))[0];
    } catch (e) {
      if (e.status === 409) throw new Error("Este produto já tem uma promoção. Edite a existente na lista de promoções.");
      throw e;
    }
  }

  function setPromotionActive(id, active) { return C.rest.update("promotions", { id: eq(id) }, { is_active: active }); }
  function deletePromotion(id) { return C.rest.remove("promotions", { id: eq(id) }); }

  window.HLAdmin.data = {
    MAX_PHOTOS: MAX_PHOTOS,
    prepareImage: prepareImage,
    listCategories: listCategories,
    listProducts: listProducts, getProduct: getProduct,
    validateProduct: validateProduct, saveProduct: saveProduct, setProductVisible: setProductVisible, deleteProduct: deleteProduct,
    discountPct: discountPct, promoStatus: promoStatus, listPromotions: listPromotions,
    validatePromotion: validatePromotion, savePromotion: savePromotion,
    setPromotionActive: setPromotionActive, deletePromotion: deletePromotion,
    isoToDate: isoToDate,
  };
})();
