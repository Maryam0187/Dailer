#!/usr/bin/env bash
# Download CallLogs + UserActivities older than BEFORE_DATE (local archive only).
# Does not delete anything — purge stays on the Data retention UI.
#
# Usage (same .env.db-dump as dump-prod-db.sh):
#   BEFORE_DATE=2026-01-01 ./scripts/dump-retention-archive.sh
#
# Cutoff matches the app: start of BEFORE_DATE in Asia/Karachi (UTC+5).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${DUMP_ENV_FILE:-$ROOT_DIR/.env.db-dump}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${PROD_MYSQL_HOST:?Set PROD_MYSQL_HOST (public Railway host, e.g. crossover.proxy.rlwy.net)}"
: "${PROD_MYSQL_PORT:?Set PROD_MYSQL_PORT (public TCP proxy port)}"
: "${PROD_MYSQL_USER:?Set PROD_MYSQL_USER}"
: "${PROD_MYSQL_PASSWORD:?Set PROD_MYSQL_PASSWORD}"
: "${PROD_MYSQL_DATABASE:?Set PROD_MYSQL_DATABASE}"

BEFORE_DATE="${BEFORE_DATE:-}"
if [[ ! "$BEFORE_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "ERROR: Set BEFORE_DATE=YYYY-MM-DD (same as Data retention \"Delete records before\")." >&2
  echo "Example: BEFORE_DATE=2026-01-01 ./scripts/dump-retention-archive.sh" >&2
  exit 1
fi

# createdAt < start of BEFORE_DATE in Asia/Karachi (+05:00, no DST)
WHERE="createdAt < CONVERT_TZ('${BEFORE_DATE} 00:00:00', '+05:00', '+00:00')"

OUT_DIR="${DUMP_OUT_DIR:-$ROOT_DIR/sql}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_CALLS="${OUT_DIR}/CallLogs-before-${BEFORE_DATE}-${STAMP}.sql"
OUT_ACTS="${OUT_DIR}/UserActivities-before-${BEFORE_DATE}-${STAMP}.sql"

mkdir -p "$OUT_DIR"

MYSQL_ARGS=(
  -h "$PROD_MYSQL_HOST"
  -P "$PROD_MYSQL_PORT"
  -u "$PROD_MYSQL_USER"
  -p"$PROD_MYSQL_PASSWORD"
  --protocol=TCP
)

dump_table() {
  local table="$1"
  local out="$2"
  local tmp="${out}.tmp.$$"

  echo "Dumping ${table} where ${WHERE} ..."
  mysqldump \
    "${MYSQL_ARGS[@]}" \
    --single-transaction \
    --set-gtid-purged=OFF \
    --where="$WHERE" \
    "$PROD_MYSQL_DATABASE" "$table" > "$tmp"

  if ! grep -q "Dump completed on" "$tmp"; then
    echo "ERROR: ${table} dump looks incomplete. Not keeping $out" >&2
    rm -f "$tmp"
    exit 1
  fi

  mv -f "$tmp" "$out"
  echo "OK: wrote $out ($(du -h "$out" | cut -f1))"
}

echo "Archive download only (no delete). BEFORE_DATE=${BEFORE_DATE} (Asia/Karachi day start)."
echo "Target: ${PROD_MYSQL_DATABASE} @ ${PROD_MYSQL_HOST}:${PROD_MYSQL_PORT}"

dump_table "CallLogs" "$OUT_CALLS"
dump_table "UserActivities" "$OUT_ACTS"

echo "Done. Purge the same before-date in the Data retention UI when ready."
