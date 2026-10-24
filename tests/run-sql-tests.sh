#!/usr/bin/env bash
# Testes do SQL de cupons contra um PostgreSQL real (descartável).
# Uso:  PGHOST=/caminho/socket PGPORT=5544 PGUSER=postgres tests/run-sql-tests.sh
# Precisa de um servidor PostgreSQL 14+ acessível. Cria/derruba o banco "hltest".
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -q -v ON_ERROR_STOP=1"
$P -d postgres -c "drop database if exists hltest" -c "create database hltest" 2>/dev/null
for f in tests/sql/00-supabase-stub.sql db/schema.sql db/seed.sql db/coupons.sql; do
  $P -d hltest -f "$f" >/dev/null 2>&1 || { echo "Falha ao aplicar $f"; $P -d hltest -f "$f"; exit 1; }
done
$P -d hltest -f tests/sql/coupons.test.sql 2>&1 | grep -E "ok - |FALHOU|ERROR|TODOS|passaram" | sed 's/^psql:[^ ]* //'

# ---------- Concorrência: 30 pedidos simultâneos para um cupom com limite 3 ----------
$P -d hltest -c "insert into public.coupons (code, discount_type, discount_value, max_uses) values ('CONC3','percent',10,3) on conflict do nothing" >/dev/null
OUT=$(mktemp -d)
for i in $(seq 1 30); do
  ( psql -q -t -A -d hltest -c "set role anon; select (public.reserve_coupon('CONC3', '[{\"id\":901,\"qty\":1}]', gen_random_uuid())->>'ok')" > "$OUT/$i.txt" 2>&1 ) &
done
wait
OKS=$(cat "$OUT"/*.txt | grep -c '^true$' || true)
FALSES=$(cat "$OUT"/*.txt | grep -c '^false$' || true)
ROWS=$($P -d hltest -t -A -c "select count(*) from public.coupon_redemptions where coupon_code='CONC3' and status='reserved'")
echo "concorrência: $OKS reservas aceitas, $FALSES recusadas, $ROWS linhas gravadas (esperado: 3 / 27 / 3)"
if [ "$OKS" != "3" ] || [ "$ROWS" != "3" ] || [ "$FALSES" != "27" ]; then echo "FALHOU: limite global violado sob concorrência"; exit 1; fi
echo "ok - limite global respeitado sob concorrência"
