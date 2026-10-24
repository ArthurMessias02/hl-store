"""Teste de ponta a ponta dos CUPONS no Chromium, com o Supabase SUBSTITUÍDO por um mini-PostgREST
que executa as consultas num PostgreSQL REAL (as funções e regras de db/coupons.sql de verdade).

Uso (da raiz do projeto):
  PGHOST=/caminho/socket PGPORT=5544 PGUSER=postgres python3 -I tests/e2e-cupons.py .

O que NÃO é real: o PostgREST/Auth do Supabase (simulados aqui). O que É real: o banco (RLS,
papéis anon/authenticated, funções validate/reserve/confirm), o carrinho, o painel e o navegador.
"""
import sys, os, json, re, subprocess, threading, http.server, socketserver, functools, urllib.parse
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
DB = "hle2e"
SUPA = "https://jrdkcfhfunclkssxpaei.supabase.co"
ADMIN_ID = "aaaaaaaa-0000-0000-0000-000000000001"
USER_ID = "bbbbbbbb-0000-0000-0000-000000000002"
PSQL = ["psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]

# ---------------------------------------------------------------- banco
def sql(stmt, db=DB, check=True):
    r = subprocess.run(PSQL + ["-d", db, "-c", stmt], capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError(r.stderr)
    return r

def setup_db():
    for f in ["tests/sql/00-supabase-stub.sql", "db/schema.sql", "db/seed.sql", "db/coupons.sql"]:
        pass
    subprocess.run(PSQL + ["-d", "postgres", "-c", f"drop database if exists {DB}"], check=True, capture_output=True)
    subprocess.run(PSQL + ["-d", "postgres", "-c", f"create database {DB}"], check=True, capture_output=True)
    for f in ["tests/sql/00-supabase-stub.sql", "db/schema.sql", "db/seed.sql", "db/coupons.sql"]:
        r = subprocess.run(PSQL + ["-d", DB, "-f", os.path.join(ROOT, f)], capture_output=True, text=True)
        if r.returncode:
            raise RuntimeError(f"{f}: {r.stderr}")
    sql(f"insert into auth.users(id,email) values ('{ADMIN_ID}','admin@teste.com'),('{USER_ID}','cliente@teste.com');"
        f"insert into public.admin_users(user_id) values ('{ADMIN_ID}');"
        "insert into public.categories(id,slug,name) values ('c0000000-0000-0000-0000-00000000000a','camisas','Camisas');"
        "update public.products set category_id='c0000000-0000-0000-0000-00000000000a' where public_id in (1,2);")

def q(v):
    return "'" + str(v).replace("'", "''") + "'"

def run_as(role_sub, body_sql):
    """Executa body_sql (que devolve 1 linha json) como anon ou authenticated(sub)."""
    role, sub = role_sub
    pre = f"set local role {role}; select set_config('request.jwt.claim.sub', {q(sub or '')}, true);"
    r = subprocess.run(PSQL + ["-d", DB], input=f"begin; {pre} {body_sql} commit;", capture_output=True, text=True)
    return r

TABLES = {"products", "product_images", "promotions", "site_content", "categories", "coupons",
          "coupon_redemptions", "admin_users", "banners"}
ID = re.compile(r"^[a-z_]+$")

def where_clause(params):
    out = []
    for k, v in params:
        if k in ("select", "order", "limit", "offset"):
            continue
        m = re.match(r"^(eq|neq|gt|gte|lt|lte|is)\.(.*)$", v)
        if not (ID.match(k) and m):
            continue
        op = {"eq": "=", "neq": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}.get(m.group(1))
        out.append(f"{k} is null" if m.group(1) == "is" else f"{k} {op} {q(m.group(2))}")
    return (" where " + " and ".join(out)) if out else ""

def order_clause(params):
    for k, v in params:
        if k == "order":
            parts = []
            for p in v.split(","):
                c, _, d = p.partition(".")
                if ID.match(c):
                    parts.append(f"{c} {'desc' if d == 'desc' else 'asc'}")
            return " order by " + ", ".join(parts) if parts else ""
    return ""

def limit_clause(params):
    for k, v in params:
        if k == "limit" and v.isdigit():
            return f" limit {v}"
    return ""

def json_result(r):
    if r.returncode:
        m = re.search(r"ERROR:\s+([0-9A-Z]{5}):\s+(.*)", r.stderr)
        code, msg = (m.group(1), m.group(2)) if m else ("XX000", r.stderr.strip())
        status = 409 if code == "23505" else 403 if code == "42501" else 400
        return status, {"code": code, "message": msg}
    js = [l for l in r.stdout.splitlines() if l.strip().startswith(("[", "{", "null", "true", "false", '"'))]
    return 200, json.loads(js[-1]) if js else None

def handle_rest(method, path, params, body, auth):
    role = ("authenticated", auth[len("fake-"):]) if auth.startswith("fake-") else ("anon", None)
    m = re.match(r"^/rest/v1/rpc/([a-z_]+)$", path)
    if m:
        args = json.loads(body or "{}")
        named = ", ".join(f"{k} => {q(json.dumps(v)) + '::jsonb' if isinstance(v, (list, dict)) else (q(v) if v is not None else 'null')}" for k, v in args.items())
        fn = m.group(1)
        stmt = f"select to_json(public.{fn}({named}));" if fn not in ("admin_coupon_usage",) else "select coalesce(jsonb_agg(u),'[]') from public.admin_coupon_usage() u;"
        return json_result(run_as(role, stmt))
    m = re.match(r"^/rest/v1/([a-z_]+)$", path)
    if not m or m.group(1) not in TABLES:
        return 404, {"message": "not found"}
    t = m.group(1)
    if method == "GET":
        sel = dict(params).get("select", "*")
        cols = "*" if sel == "*" or not re.fullmatch(r"[a-z_,*]+", sel) else sel
        stmt = f"select coalesce(jsonb_agg(x),'[]') from (select {cols} from public.{t}{where_clause(params)}{order_clause(params)}{limit_clause(params)}) x;"
        return json_result(run_as(role, stmt))
    data = json.loads(body) if body else None
    if method == "POST":
        rows = data if isinstance(data, list) else [data]
        cols = sorted({k for r in rows for k in r})
        coltxt = ", ".join(cols)
        sel = ", ".join(f"r.{c}" for c in cols)
        stmt = (f"with r as (select * from json_populate_recordset(null::public.{t}, {q(json.dumps(rows))}::json)), "
                f"i as (insert into public.{t} ({coltxt}) select {sel} from r returning *) select coalesce(jsonb_agg(i),'[]') from i;")
        return json_result(run_as(role, stmt))
    if method == "PATCH":
        sets = ", ".join(f"{k} = (json_populate_record(null::public.{t}, {q(json.dumps({k: v}))}::json)).{k}" for k, v in data.items() if ID.match(k))
        stmt = f"with u as (update public.{t} set {sets}{where_clause(params)} returning *) select coalesce(jsonb_agg(u),'[]') from u;"
        return json_result(run_as(role, stmt))
    if method == "DELETE":
        stmt = f"with d as (delete from public.{t}{where_clause(params)} returning *) select coalesce(jsonb_agg(d),'[]') from d;"
        return json_result(run_as(role, stmt))
    return 405, {}

CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*",
        "access-control-expose-headers": "content-range"}

def supa_route(route, request):
    if request.method == "OPTIONS":
        return route.fulfill(status=204, headers=CORS)
    u = urllib.parse.urlparse(request.url)
    params = urllib.parse.parse_qsl(u.query, keep_blank_values=True)
    auth = (request.headers.get("authorization") or "").replace("Bearer ", "")
    if u.path.startswith("/auth/v1/token"):
        body = json.loads(request.post_data or "{}")
        if body.get("password") == "errada":
            return route.fulfill(status=400, headers=CORS, content_type="application/json", body=json.dumps({"error": "invalid_grant"}))
        r = sql(f"select id from auth.users where email = {q(body.get('email'))}")
        uid = r.stdout.strip()
        if not uid:
            return route.fulfill(status=400, headers=CORS, content_type="application/json", body="{}")
        return route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps(
            {"access_token": "fake-" + uid, "refresh_token": "r", "expires_in": 3600, "user": {"id": uid, "email": body.get("email")}}))
    if u.path.startswith("/auth/v1/logout"):
        return route.fulfill(status=204, headers=CORS)
    if u.path.startswith("/rest/v1/"):
        status, payload = handle_rest(request.method, u.path, params, request.post_data, auth)
        return route.fulfill(status=status, headers=CORS, content_type="application/json", body=json.dumps(payload))
    route.fulfill(status=404, headers=CORS, body="{}")

# ---------------------------------------------------------------- site estático
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    h = functools.partial(Quiet, directory=ROOT)
    srv = socketserver.TCPServer(("127.0.0.1", 0), h); srv.allow_reuse_address = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]

# ---------------------------------------------------------------- mini framework de teste
passed, failed = [], []
def check(cond, name, extra=""):
    (passed if cond else failed).append(name)
    print(("ok   - " if cond else "FAIL - ") + name + ((" :: " + str(extra)) if (extra and not cond) else ""))

def money(cents):
    return "R$ " + f"{cents/100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

def norm(t):
    return re.sub(r"\s+", " ", (t or "").replace("\xa0", " ")).strip()

INIT = """
window.__opened = [];
window.open = function () { return { opener: null, close: function(){ window.__closed = true; }, location: { set href(v) { window.__opened.push(v); } } }; };
try { localStorage.setItem('hl_lead_status', 'registered'); } catch (e) {}
"""

def new_page(ctx, errors):
    pg = ctx.new_page()
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.route(SUPA + "/**", supa_route)
    return pg

# ---------------------------------------------------------------- LOJA
def store_tests(b, base):
    errors = []
    ctx = b.new_context(viewport={"width": 390, "height": 740}, is_mobile=True, has_touch=True, device_scale_factor=2)
    ctx.add_init_script(INIT)
    pg = new_page(ctx, errors)
    pg.goto(base + "/index.html"); pg.wait_for_selector(".product")
    check(pg.evaluate("window.HL_DATA.source") == "supabase", "loja lê produtos do banco (modo supabase)")

    def add(pid, size="M"):
        pg.evaluate("([id,s]) => HLCart.add(id, s)", [pid, size])

    def open_cart():
        if not pg.evaluate("document.getElementById('cart').classList.contains('is-open')"):
            pg.click("#cart-button")
        pg.wait_for_timeout(450)

    def apply(code):
        if pg.is_visible("#coupon-toggle"):
            pg.click("#coupon-toggle")
        pg.fill("#coupon-input", code)
        pg.click("#coupon-apply")
        pg.wait_for_function("document.getElementById('coupon-applied').hidden === false || document.getElementById('coupon-msg').hidden === false")
        pg.wait_for_function("window.HLCoupons.state.status !== 'checking'")

    def txt(sel): return norm(pg.inner_text(sel))

    # --- sem cupom: comportamento antigo
    add(1); open_cart()
    check(txt("#cart-total") == "R$ 89,99", "sem cupom: total = subtotal")
    check(pg.is_hidden("#cart-summary"), "sem cupom: resumo de desconto oculto")
    check(pg.get_attribute("#cart-checkout", "href").startswith("https://wa.me/") and "Cupom" not in pg.evaluate("HLCart.message()"), "sem cupom: mensagem do WhatsApp idêntica à de antes")

    # --- cupom inválido
    apply("naoexiste")
    check("inválido" in txt("#coupon-msg"), "código inexistente: mensagem clara", txt("#coupon-msg"))
    check(txt("#cart-total") == "R$ 89,99", "código inexistente: total não muda")

    # --- cupom de boas-vindas (minúsculas e espaços)
    apply("  bemvindo10 ")
    check(not pg.is_hidden("#coupon-applied") and txt("#coupon-tag") == "BEMVINDO10", "BEMVINDO10 aplicado (aceita minúsculas e espaços)")
    check(txt("#cart-subtotal") == "R$ 89,99" and txt("#cart-discount") == "−R$ 9,00" and txt("#cart-total") == "R$ 80,99",
          "10% de 89,99 = R$ 9,00 (arredondado) e total R$ 80,99", (txt("#cart-subtotal"), txt("#cart-discount"), txt("#cart-total")))
    check(pg.evaluate("document.getElementById('cart-foot').getBoundingClientRect().bottom <= window.innerHeight + 1"), "mobile: rodapé do carrinho cabe na tela")
    check(pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "mobile: sem rolagem horizontal")
    pg.screenshot(path="/var/tmp/hlpg/cart-mobile-applied.png")

    # --- mudar quantidade: recalcula sem duplicar
    pg.click('[data-action="inc"]')
    pg.wait_for_function("window.HLCoupons.state.status === 'applied' && window.HLCoupons.state.result.subtotal_cents === 17998")
    check(txt("#cart-discount") == "−R$ 18,00" and txt("#cart-total") == "R$ 161,98", "2 peças: desconto 18,00 e total 161,98 (sem duplicar)",
          (txt("#cart-discount"), txt("#cart-total")))
    pg.click('[data-action="dec"]')
    pg.wait_for_function("window.HLCoupons.state.status === 'applied' && window.HLCoupons.state.result.subtotal_cents === 8999")
    check(txt("#cart-total") == "R$ 80,99", "voltar a 1 peça: total volta a 80,99")

    # --- remover cupom
    pg.click("#coupon-remove")
    check(txt("#cart-total") == "R$ 89,99" and pg.is_hidden("#cart-summary"), "remover cupom: total volta ao subtotal")

    # --- promoção: item em promoção não recebe o cupom; total coerente
    sql("insert into public.promotions(product_id, promo_price) select id, 90.00 from public.products where public_id = 2")
    pg.reload(); pg.wait_for_selector(".product")
    pg.evaluate("HLCart.clear()")
    add(2); open_cart()
    check(txt("#cart-total") == "R$ 90,00", "promoção existente continua valendo no carrinho (R$ 90,00)")
    apply("BEMVINDO10")
    check("promoção" in txt("#coupon-msg"), "cupom padrão não vale para item em promoção", txt("#coupon-msg"))
    check(txt("#cart-total") == "R$ 90,00", "item em promoção: total sem desconto duplo")
    add(1)
    pg.wait_for_function("window.HLCoupons.state.status === 'applied'")
    check(txt("#cart-subtotal") == "R$ 179,99" and txt("#cart-discount") == "−R$ 9,00" and txt("#cart-total") == "R$ 170,99",
          "carrinho misto: desconto só sobre a peça sem promoção", (txt("#cart-subtotal"), txt("#cart-discount"), txt("#cart-total")))

    # --- finalizar: reserva (não consome) e mensagem do WhatsApp
    pg.click("#cart-checkout")
    pg.wait_for_function("window.__opened.length === 1")
    url = urllib.parse.unquote(pg.evaluate("window.__opened[0]"))
    check("Cupom BEMVINDO10: -R$ 9,00" in url and "Total: R$ 170,99" in url and "Subtotal: R$ 179,99" in url, "WhatsApp: cupom, subtotal e total corretos", url)
    ref = re.search(r"Pedido: (HL-[A-Z2-9]{6})", url)
    check(bool(ref), "WhatsApp: número do pedido HL-XXXXXX presente")
    row = sql(f"select status, discount_cents, total_cents from public.coupon_redemptions where order_ref = {q(ref.group(1) if ref else '')}").stdout.strip()
    check(row == "reserved|900|17099", "banco: pedido ficou RESERVADO (não consumido) com valores do servidor", row)
    pg.click("#cart-checkout"); pg.wait_for_function("window.__opened.length === 2")
    n = sql("select count(*) from public.coupon_redemptions where status='reserved'").stdout.strip()
    check(n == "1", "clicar duas vezes reaproveita a mesma reserva", n)

    # --- cupons de teste via banco: expirado, inativo, agendado, mínimo, esgotado, fixo, produto, categoria
    sql("insert into public.coupons(code,discount_type,discount_value,ends_at) values ('EXPIRADO','percent',10, now() - interval '1 day');"
        "insert into public.coupons(code,discount_type,discount_value,is_active) values ('INATIVO','percent',10,false);"
        "insert into public.coupons(code,discount_type,discount_value,min_purchase) values ('MINIMO300','percent',10,300);"
        "insert into public.coupons(code,discount_type,discount_value) values ('FIXO20','fixed',20);"
        "insert into public.coupons(code,discount_type,discount_value) values ('FIXOGRANDE','fixed',500);"
        "insert into public.coupons(code,discount_type,discount_value,max_uses) values ('UMUSO','percent',10,1);"
        "insert into public.coupons(code,discount_type,discount_value,scope,product_id) select 'SOP3','percent',50,'product',id from public.products where public_id = 3;"
        "insert into public.coupons(code,discount_type,discount_value,scope,category_id) values ('SOCAMISAS','percent',10,'category','c0000000-0000-0000-0000-00000000000a');")
    pg.evaluate("HLCart.clear()"); add(1)
    for code, expected in [("EXPIRADO", "expirou"), ("INATIVO", "não está ativo"), ("MINIMO300", "R$ 300,00"), ("SOP3", "não se aplica")]:
        apply(code)
        check(expected in txt("#coupon-msg"), f"{code}: mensagem '{expected}'", txt("#coupon-msg"))
    apply("FIXO20")
    check(txt("#cart-discount") == "−R$ 20,00" and txt("#cart-total") == "R$ 69,99", "valor fixo R$ 20,00 aplicado", (txt("#cart-discount"), txt("#cart-total")))
    pg.click("#coupon-remove")
    apply("FIXOGRANDE")
    check(txt("#cart-discount") == "−R$ 89,99" and txt("#cart-total") == "R$ 0,00", "fixo maior que a compra: limitado ao valor elegível, total nunca negativo", (txt("#cart-discount"), txt("#cart-total")))
    pg.click("#coupon-remove")
    apply("SOCAMISAS")
    check(txt("#cart-discount") == "−R$ 9,00", "cupom de categoria aplica na categoria", txt("#cart-discount"))
    pg.click("#coupon-remove")
    # mínimo atingido ao adicionar peças: revalida sozinho
    apply("MINIMO300")
    add(3); add(4); add(5); add(1)
    pg.wait_for_function("window.HLCoupons.state.status === 'applied'", timeout=8000)
    check(txt("#cart-discount").startswith("−R$"), "mínimo: ao atingir o valor mínimo o cupom passa a valer sozinho", txt("#cart-discount"))
    pg.evaluate("HLCart.remove(5,'M'); HLCart.remove(4,'M'); HLCart.remove(3,'M')")
    pg.wait_for_function("window.HLCoupons.state.status === 'invalid'", timeout=8000)
    check("R$ 300,00" in txt("#coupon-msg") and txt("#cart-total") == txt("#cart-subtotal") or pg.is_hidden("#cart-summary"), "mínimo: ao cair abaixo o desconto some", txt("#coupon-msg"))
    pg.evaluate("window.HLCoupons.remove(); HLCart.clear();"); add(1)

    # --- limite global: esgotado depois que outra pessoa reserva
    sql("select public.reserve_coupon('UMUSO', '[{\"id\":1,\"qty\":1}]', gen_random_uuid())")
    apply("UMUSO")
    check("esgotou" in txt("#coupon-msg"), "cupom esgotado é recusado", txt("#coupon-msg"))

    # --- ao finalizar, se o cupom foi desativado no meio: recusa e NÃO abre o WhatsApp
    pg.click("#coupon-remove") if not pg.is_hidden("#coupon-applied") else None
    sql("insert into public.coupons(code,discount_type,discount_value) values ('SUMIU','percent',10)")
    apply("SUMIU")
    sql("update public.coupons set is_active=false where code='SUMIU'")
    before = pg.evaluate("window.__opened.length")
    pg.click("#cart-checkout"); pg.wait_for_timeout(900)
    check(pg.evaluate("window.__opened.length") == before and "não está ativo" in txt("#coupon-msg"), "cupom desativado antes de finalizar: pedido não sai com desconto", txt("#coupon-msg"))

    # --- preço adulterado no navegador não muda o que o banco cobra
    pg.evaluate("window.HLCoupons.remove()")
    r = pg.evaluate("""async () => { const r = await fetch('%s/rest/v1/rpc/validate_coupon', {method:'POST', headers:{'Content-Type':'application/json', apikey:'x'},
        body: JSON.stringify({p_code:'BEMVINDO10', p_items:[{id:1, qty:1, price:0.01, unit_cents:1}]})}); return r.json(); }""" % SUPA)
    check(r.get("subtotal_cents") == 8999, "preço enviado pelo navegador é ignorado pelo banco", r)

    # --- cadastro: o código do popup é o mesmo do banco
    ctx2 = b.new_context(viewport={"width": 390, "height": 740});
    pg2 = new_page(ctx2, errors)
    pg2.goto(base + "/index.html"); pg2.wait_for_selector(".product")
    pop = norm(pg2.evaluate("document.querySelector('.lead-coupon-code').textContent"))
    conf = pg2.evaluate("window.HL_CONFIG.welcomeCouponCode")
    val = pg2.evaluate("""async () => { const r = await fetch('%s/rest/v1/rpc/validate_coupon', {method:'POST', headers:{'Content-Type':'application/json', apikey:'x'},
        body: JSON.stringify({p_code: document.querySelector('.lead-coupon-code').textContent, p_items:[{id:1, qty:1}]})}); return r.json(); }""" % SUPA)
    check(pop == conf == "BEMVINDO10" and val.get("ok") is True and val.get("discount_type") == "percent" and float(val.get("discount_value")) == 10.0,
          "cupom do popup de cadastro = config = banco (10% percentual)", (pop, conf, val))
    ctx2.close()

    # --- tela larga: carrinho
    ctx3 = b.new_context(viewport={"width": 1280, "height": 800}); ctx3.add_init_script(INIT)
    pg3 = new_page(ctx3, errors); pg3.goto(base + "/index.html"); pg3.wait_for_selector(".product")
    pg3.evaluate("HLCart.add(1,'M')"); pg3.click("#cart-button"); pg3.wait_for_timeout(450)
    pg3.click("#coupon-toggle"); pg3.fill("#coupon-input", "BEMVINDO10"); pg3.press("#coupon-input", "Enter")
    pg3.wait_for_function("window.HLCoupons.state.status === 'applied'")
    check(norm(pg3.inner_text("#cart-total")) == "R$ 80,99", "desktop: cupom aplicado com Enter")
    pg3.screenshot(path="/var/tmp/hlpg/cart-desktop-applied.png")
    ctx3.close()

    real_errors = [e for e in errors if "Failed to load resource" not in e and "net::ERR" not in e]
    check(not real_errors, "console da loja sem erros de JavaScript", real_errors[:3])
    ctx.close()

# ---------------------------------------------------------------- ADMIN
def admin_tests(b, base):
    errors = []
    ctx = b.new_context(viewport={"width": 390, "height": 780}, is_mobile=True, has_touch=True)
    pg = new_page(ctx, errors)
    pg.goto(base + "/admin/#/login"); pg.wait_for_selector("#l-email")

    # cliente comum (não admin) é barrado
    pg.fill("#l-email", "cliente@teste.com"); pg.fill("#l-pass", "x"); pg.click("button[type=submit]")
    pg.wait_for_selector(".login__error:not([hidden])")
    check("permissão" in norm(pg.inner_text(".login__error")), "cliente comum não entra no painel")
    check(pg.evaluate("localStorage.getItem('hl-admin-session')") is None, "sessão do cliente comum descartada")

    # administrador entra
    pg.fill("#l-email", "admin@teste.com"); pg.fill("#l-pass", "x"); pg.click("button[type=submit]")
    pg.wait_for_selector(".home")
    check(pg.is_visible('#nav a[data-nav="cupons"]'), "menu mostra 'Cupons'")
    pg.click('#nav a[data-nav="cupons"]'); pg.wait_for_selector("#coupon-list")
    check("BEMVINDO10" in pg.inner_text("#coupon-list"), "lista mostra BEMVINDO10 criado pela migração")
    check(pg.evaluate("document.querySelector('#nav a[data-nav=cupons]').classList.contains('is-on')"), "menu destaca 'Cupons'")
    check(pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "admin mobile: sem rolagem horizontal")

    def fill_form(code, type_="percent", value="15", scope="cart", **kw):
        pg.fill("#c-code", code); pg.select_option("#c-type", type_); pg.fill("#c-value", value); pg.select_option("#c-scope", scope)
        for k, sel in [("start", "#c-start"), ("end", "#c-end"), ("min", "#c-min"), ("max", "#c-max"), ("per", "#c-per")]:
            pg.fill(sel, kw.get(k, ""))

    def save_and_wait():
        pg.click("button[type=submit]"); pg.wait_for_timeout(700)

    def toast_text():
        return norm(" ".join(pg.eval_on_selector_all("#toasts .toast", "els => els.map(e => e.textContent)"))) if pg.query_selector("#toasts") else ""

    # criar
    pg.click("text=+ NOVO CUPOM"); pg.wait_for_selector("#c-code")
    fill_form("verao 15", value="15", min="100,00", max="50")
    save_and_wait(); pg.wait_for_selector("#coupon-list")
    check("VERAO15" in pg.inner_text("#coupon-list"), "cupom criado (código normalizado VERAO15)")
    r = sql("select discount_type, discount_value, min_purchase, max_uses, is_active from public.coupons where code='VERAO15'").stdout.strip()
    check(r == "percent|15.00|100.00|50|t", "gravado no banco com os valores informados", r)

    # inválidos
    pg.click("text=+ NOVO CUPOM"); pg.wait_for_selector("#c-code")
    fill_form("VERAO15", value="10"); save_and_wait()
    check("já existe" in toast_text().lower(), "código duplicado é rejeitado", toast_text())
    fill_form("NOVO1", value="150"); save_and_wait()
    check("100%" in norm(pg.inner_text('[data-field="value"] .field__error')), "percentual acima de 100% é rejeitado")
    fill_form("NOVO1", value="-5"); save_and_wait()
    check(not pg.is_hidden('[data-field="value"] .field__error'), "desconto negativo é rejeitado")
    fill_form("NOVO1", value="10", start="2026-12-31T10:00", end="2026-12-30T10:00"); save_and_wait()
    check("depois do início" in norm(pg.inner_text('[data-field="endsAt"] .field__error')), "data final antes da inicial é rejeitada")
    fill_form("A", value="10"); save_and_wait()
    check(not pg.is_hidden('[data-field="code"] .field__error'), "código curto/ inválido é rejeitado")
    fill_form("NOVO1", value="10", max="0"); save_and_wait()
    check(not pg.is_hidden('[data-field="max"] .field__error'), "limite de usos zero é rejeitado")
    pg.select_option("#c-scope", "product"); pg.fill("#c-max", ""); save_and_wait()
    check(not pg.is_hidden('[data-field="productId"] .field__error'), "escopo produto exige escolher o produto")
    check(sql("select count(*) from public.coupons where code='NOVO1'").stdout.strip() == "0", "nenhum cupom inválido chegou ao banco")

    # cupom de produto + fixo
    pg.select_option("#c-scope", "product"); pg.select_option("#c-product", label="Camiseta Tommy Hilfiger")
    fill_form("TOMMY20", type_="fixed", value="20,50", scope="product")
    pg.select_option("#c-product", label="Camiseta Tommy Hilfiger"); save_and_wait(); pg.wait_for_selector("#coupon-list")
    r = sql("select discount_type, discount_value, scope, product_id is not null from public.coupons where code='TOMMY20'").stdout.strip()
    check(r == "fixed|20.50|product|t", "cupom de valor fixo por produto criado", r)

    # buscar
    pg.fill("#coupon-search", "tom")
    check(pg.eval_on_selector_all("#coupon-list li.row", "e => e.length") == 1 and "TOMMY20" in pg.inner_text("#coupon-list"), "busca por código filtra a lista")
    pg.fill("#coupon-search", "")

    # editar
    pg.click('li[data-code="VERAO15"] a'); pg.wait_for_selector("#c-code")
    pg.fill("#c-value", "20"); pg.click("button[type=submit]"); pg.wait_for_selector("#coupon-list")
    check(sql("select discount_value from public.coupons where code='VERAO15'").stdout.strip() == "20.00", "edição gravada (15% -> 20%)")

    # desativar / ativar
    pg.click('li[data-code="VERAO15"] button[data-id]'); pg.wait_for_timeout(700)
    check(sql("select is_active from public.coupons where code='VERAO15'").stdout.strip() == "f", "desativar grava no banco")
    check("inativo" in pg.inner_text('li[data-code="VERAO15"]').lower(), "lista mostra 'Inativo'")
    pg.click('li[data-code="VERAO15"] button[data-id]'); pg.wait_for_timeout(700)
    check(sql("select is_active from public.coupons where code='VERAO15'").stdout.strip() == "t", "ativar grava no banco")

    # expirado / esgotado / agendado visíveis
    sql("insert into public.coupons(code,discount_type,discount_value,ends_at) values ('VENCIDO','percent',5, now() - interval '2 days');"
        "insert into public.coupons(code,discount_type,discount_value,starts_at) values ('FUTURO','percent',5, now() + interval '2 days');"
        "insert into public.coupons(code,discount_type,discount_value,max_uses) values ('ACABOU','percent',5,1);"
        "select public.reserve_coupon('ACABOU','[{\"id\":1,\"qty\":1}]', gen_random_uuid());")
    pg.reload(); pg.wait_for_selector("#coupon-list")
    check("expirado" in pg.inner_text('li[data-code="VENCIDO"]').lower(), "cupom expirado identificado")
    check("agendado" in pg.inner_text('li[data-code="FUTURO"]').lower(), "cupom agendado identificado")
    check("esgotado" in pg.inner_text('li[data-code="ACABOU"]').lower() and "1 reservado" in pg.inner_text('li[data-code="ACABOU"]').lower(), "cupom esgotado identificado (conta reservas)")
    pg.screenshot(path="/var/tmp/hlpg/admin-mobile-list.png", full_page=True)

    # excluir com confirmação
    pg.click('li[data-code="TOMMY20"] a'); pg.wait_for_selector("#coupon-delete"); pg.click("#coupon-delete")
    pg.wait_for_selector("dialog.sheet"); pg.click('dialog.sheet [data-act="no"]'); pg.wait_for_timeout(300)
    check(sql("select count(*) from public.coupons where code='TOMMY20'").stdout.strip() == "1", "excluir: 'Cancelar' no diálogo não apaga")
    pg.click("#coupon-delete"); pg.wait_for_selector("dialog.sheet"); pg.click('dialog.sheet [data-act="yes"]'); pg.wait_for_timeout(800)
    check(sql("select count(*) from public.coupons where code='TOMMY20'").stdout.strip() == "0", "excluir: confirmar apaga o cupom")

    # pedidos com cupom: confirmar compra
    sql("select public.reserve_coupon('BEMVINDO10','[{\"id\":1,\"qty\":1}]', 'ffffffff-0000-0000-0000-000000000001');"
        "select public.reserve_coupon('BEMVINDO10','[{\"id\":3,\"qty\":1}]', 'ffffffff-0000-0000-0000-000000000002');")
    pg.goto(base + "/admin/#/cupons/usos"); pg.wait_for_selector("#usage-list li.row")
    rows = pg.eval_on_selector_all("#usage-list li.row", "e => e.length")
    check(rows >= 2, "tela 'Pedidos com cupom' lista as reservas", rows)
    first = pg.query_selector('#usage-list li.row:has-text("BEMVINDO10") button[data-act=confirm]')
    first.click(); pg.wait_for_selector("dialog.sheet")
    pg.click('dialog.sheet [data-act="yes"]'); pg.wait_for_timeout(300)
    check(not pg.is_hidden("dialog.sheet #ask-phone ~ .field__error"), "limite por cliente: confirmar exige o WhatsApp")
    pg.fill("#ask-phone", "(15) 99825-0486"); pg.click('dialog.sheet [data-act="yes"]'); pg.wait_for_timeout(900)
    check(sql("select count(*) from public.coupon_redemptions where status='confirmed' and customer_phone='+5515998250486'").stdout.strip() == "1", "compra confirmada com o WhatsApp normalizado")
    second = pg.query_selector('#usage-list li.row:has-text("BEMVINDO10") button[data-act=confirm]')
    second.click(); pg.wait_for_selector("dialog.sheet"); pg.fill("#ask-phone", "15998250486"); pg.click('dialog.sheet [data-act="yes"]'); pg.wait_for_timeout(900)
    check("já usou" in toast_text(), "mesmo WhatsApp não consome o cupom de novo", toast_text())

    real = [e for e in errors if "Failed to load resource" not in e and "net::ERR" not in e and "404" not in e]
    check(not real, "console do admin sem erros de JavaScript", real[:3])
    ctx.close()

# ---------------------------------------------------------------- execução
if __name__ == "__main__":
    setup_db()
    srv, port = serve()
    base = f"http://127.0.0.1:{port}"
    with sync_playwright() as p:
        b = p.chromium.launch()
        store_tests(b, base)
        admin_tests(b, base)
        b.close()
    print(f"\n{len(passed)} passaram, {len(failed)} falharam")
    if failed:
        print("Falhas:", *failed, sep="\n  - ")
        sys.exit(1)
