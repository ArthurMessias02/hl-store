"""Teste de ponta a ponta no Chromium com Supabase SIMULADO (route interception).
Uso: python3 -I e2e.py <pasta-do-projeto>
Não toca o banco real. Cobre promoções, card, carrinho, WhatsApp, falha de consulta e ordem."""
import sys, json, threading, http.server, socketserver, functools, datetime, urllib.parse
from playwright.sync_api import sync_playwright

ROOT = sys.argv[1]
now = datetime.datetime.now(datetime.timezone.utc)
iso = lambda d: (now + datetime.timedelta(days=d)).isoformat()

def prod(uid, pid, name, price, order, stock=True):
    return dict(id=uid, public_id=pid, name=name, description="d", price=price, sizes=["M", "G"],
                in_stock=stock, featured=False, status="published", sort_order=order, created_at=iso(-30 + order))

PRODUCTS = [prod("u-shorts", 6, "Shorts Diesel", 95.99, 0), prod("u-camisa", 1, "Camiseta Tommy", 89.99, 1)]
IMAGES = [dict(product_id="u-shorts", path="assets/images/hero.svg", sort_order=0),
          dict(product_id="u-camisa", path="assets/images/hero.svg", sort_order=0)]

def promo(uid, price, active=True, start=None, end=None, order=0, pid="u-shorts"):
    return dict(id=uid, product_id=pid, promo_price=price, starts_at=start, ends_at=end,
                is_active=active, sort_order=order, created_at=iso(-1))

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Quiet, directory=ROOT)
    srv = socketserver.TCPServer(("127.0.0.1", 0), h); srv.allow_reuse_address = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]

srv, port = serve()
fails, passed = [], 0
def check(name, cond, extra=""):
    global passed
    if cond: passed += 1; print("ok  -", name)
    else: fails.append(name); print("FALHOU -", name, extra)

def run(pw, promos, products=PRODUCTS, promo_status=200):
    b = pw.chromium.launch()
    page = b.new_page(viewport=dict(width=1200, height=900))
    def handler(route):
        url = route.request.url
        if "/rest/v1/products" in url: body = products
        elif "/rest/v1/product_images" in url: body = IMAGES
        elif "/rest/v1/promotions" in url:
            if promo_status != 200: return route.fulfill(status=promo_status, body="{}")
            body = promos
        elif "/rest/v1/site_content" in url: body = []
        else: return route.continue_()
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
    page.route("**/rest/v1/**", handler)
    page.goto(f"http://127.0.0.1:{port}/index.html"); page.wait_for_selector(".product", timeout=8000)
    page.wait_for_timeout(300)
    return b, page

def state(page):
    return page.evaluate("""() => {
      const prods = [...document.querySelectorAll('.product')].map(a => ({
        name: a.querySelector('.product__name').textContent,
        price: a.querySelector('.product__price').textContent,
        badge: !!a.querySelector('.product__price-badge'),
        old: !!a.querySelector('.product__price-old') }));
      const sec = document.getElementById('promocoes');
      const cards = [...document.querySelectorAll('.promo-card')].map(c => ({
        name: c.querySelector('.promo-card__name').textContent,
        old: c.querySelector('.promo-card__old').textContent, now: c.querySelector('.promo-card__now').textContent,
        href: c.querySelector('a').getAttribute('href') }));
      return { prods, sectionHidden: sec.hidden, cards };
    }""")

def add_to_cart(page, name):
    art = page.locator(".product", has=page.locator(f"text={name}")).first
    art.locator(".size-chip").first.click(); art.locator("[data-add]").click(); page.wait_for_timeout(200)
    return page.evaluate("() => ({ total: HLCart.totalCents(), msg: HLCart.message(), unit: HLCart.lines()[0].unitCents })")

def shorts(s): return next(p for p in s["prods"] if p["name"] == "Shorts Diesel")

with sync_playwright() as pw:
    # 1 sem registro
    b, pg = run(pw, []); s = state(pg)
    check("1 sem registro: R$ 95,99, sem selo, seção oculta", "95,99" in shorts(s)["price"] and not shorts(s)["badge"] and s["sectionHidden"] and not s["cards"])
    b.close()

    # 2 ativa e válida + 8 card abre o produto certo + 9 consistência
    b, pg = run(pw, [promo("a", 65.99, True, iso(-1), iso(5))]); s = state(pg)
    sh = shorts(s)
    check("2 válida: card do catálogo 95,99 riscado, 65,99 e selo OFERTA", sh["old"] and sh["badge"] and "65,99" in sh["price"] and "95,99" in sh["price"], sh["price"])
    check("2 válida: seção de ofertas mostra o mesmo par de preços", not s["sectionHidden"] and len(s["cards"]) == 1 and "65,99" in s["cards"][0]["now"] and "95,99" in s["cards"][0]["old"], str(s["cards"]))
    check("8 card promocional aponta para #produto-6 e o alvo existe", s["cards"][0]["href"] == "#produto-6" and pg.locator("#produto-6").count() == 1)
    pg.locator(".promo-card a").first.click(); pg.wait_for_timeout(300)
    check("8 clique no card: URL #produto-6 e o título é Shorts Diesel", pg.url.endswith("#produto-6") and pg.locator("#produto-6").inner_text() == "Shorts Diesel")
    c = add_to_cart(pg, "Shorts Diesel")
    check("9 carrinho cobra 65,99 (6599 centavos) e WhatsApp também", c["unit"] == 6599 and c["total"] == 6599 and "65,99" in c["msg"] and "95,99" not in c["msg"], c["msg"])
    b.close()

    # 3 inativa
    b, pg = run(pw, [promo("a", 65.99, False)]); s = state(pg)
    check("3 inativa: preço normal, sem selo, seção oculta", "95,99" in shorts(s)["price"] and "65,99" not in shorts(s)["price"] and not shorts(s)["badge"] and s["sectionHidden"])
    c = add_to_cart(pg, "Shorts Diesel"); check("3 inativa: carrinho 95,99", c["unit"] == 9599)
    b.close()
    # 4 não iniciada / 5 expirada
    for nm, p in [("4 não iniciada", promo("a", 65.99, True, iso(2), iso(9))), ("5 expirada", promo("a", 65.99, True, iso(-9), iso(-1)))]:
        b, pg = run(pw, [p]); s = state(pg)
        check(nm + ": sem desconto em lugar nenhum", "65,99" not in shorts(s)["price"] and not shorts(s)["badge"] and s["sectionHidden"])
        b.close()
    # 6 preço >= normal
    for v in (95.99, 120):
        b, pg = run(pw, [promo("a", v, True)]); s = state(pg)
        check(f"6 promo {v} >= normal: sem desconto", not shorts(s)["badge"] and s["sectionHidden"]); b.close()
    # 7 falha na consulta de promoções (HTTP 500) — produtos continuam, sem desconto
    b, pg = run(pw, [promo("a", 65.99, True)], promo_status=500); s = state(pg)
    check("7 falha de promoções (500): produtos aparecem, preço normal, sem selo, seção oculta", len(s["prods"]) == 2 and "95,99" in shorts(s)["price"] and not shorts(s)["badge"] and s["sectionHidden"])
    c = add_to_cart(pg, "Shorts Diesel"); check("7 falha: carrinho cobra 95,99", c["unit"] == 9599)
    b.close()
    # duplicadas: menor sort_order vence, sem valores conflitantes
    b, pg = run(pw, [promo("a", 70, True, order=3), promo("b", 65.99, True, order=1)]); s = state(pg)
    check("duplicadas: vale a de menor sort_order (65,99) e só um card", "65,99" in shorts(s)["price"] and len(s["cards"]) == 1 and "65,99" in s["cards"][0]["now"])
    b.close()
    # produto A promovido, B não: B intocado
    b, pg = run(pw, [promo("a", 65.99, True)]); s = state(pg)
    cam = next(p for p in s["prods"] if p["name"] == "Camiseta Tommy")
    check("outro produto sem promoção segue sem desconto", "89,99" in cam["price"] and not cam["badge"]); b.close()
    # 10 ordem do catálogo segue sort_order (reordenação)
    swapped = [dict(PRODUCTS[0], sort_order=1), dict(PRODUCTS[1], sort_order=0)]
    swapped.sort(key=lambda p: p["sort_order"])  # o Supabase devolve já ordenado por sort_order
    b, pg = run(pw, [promo("a", 65.99, True)], products=swapped); s = state(pg)
    check("10 catálogo respeita a ordem do banco após reordenar (Camiseta antes do Shorts) e promoção continua no produto certo",
          [p["name"] for p in s["prods"]] == ["Camiseta Tommy", "Shorts Diesel"] and shorts(s)["badge"] and not next(p for p in s["prods"] if p["name"]=="Camiseta Tommy")["badge"])
    b.close()

    # produtos criados no admin SEM public_id (null): promoção, card, carrinho e link continuam certos
    nulos = [dict(PRODUCTS[0], public_id=None), dict(PRODUCTS[1], public_id=None)]
    b, pg = run(pw, [promo("a", 65.99, True)], products=nulos); s = state(pg)
    check("public_id nulo: promoção aparece no card e na seção, só no produto certo", shorts(s)["badge"] and "65,99" in shorts(s)["price"] and len(s["cards"]) == 1 and not next(p for p in s["prods"] if p["name"] == "Camiseta Tommy")["badge"], str(s))
    check("public_id nulo: link do card aponta para um alvo que existe", pg.locator(s["cards"][0]["href"]).count() == 1, s["cards"][0]["href"])
    c = add_to_cart(pg, "Shorts Diesel"); check("public_id nulo: carrinho cobra 65,99", c["unit"] == 6599, str(c))
    b.close()

print(f"\n{passed} verificações ok, {len(fails)} falhas")
sys.exit(1 if fails else 0)
