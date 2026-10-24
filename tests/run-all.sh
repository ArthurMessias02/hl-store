#!/usr/bin/env bash
# Roda todos os testes. Precisa de: node, python3 + playwright (Chromium) e um PostgreSQL 14+ acessível
# (variáveis PGHOST, PGPORT, PGUSER). Veja docs/CUPONS.md, seção "Como rodar os testes".
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== sintaxe (node --check) =="; for f in js/*.js js/data/*.js admin/js/*.js; do node --check "$f"; done; echo "ok"
echo "== promoções (regra única) =="; node tests/promotion-rules.test.js | tail -1
echo "== cliente de cupons e carrinho =="; node tests/coupons-client.test.js | tail -1
echo "== SQL de cupons (PostgreSQL real) =="; tests/run-sql-tests.sh | grep -v "ok - "
echo "== navegador: promoções (regressão) =="; python3 -I tests/e2e-promocoes.py . | tail -1
echo "== navegador: cupons (loja + painel, banco real) =="; python3 -I tests/e2e-cupons.py . | tail -3
