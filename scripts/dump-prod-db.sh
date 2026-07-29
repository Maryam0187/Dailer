#!/usr/bin/env bash
# Dump Railway production MySQL into sql/prod-backup.sql (overwrites previous backup).
# Usage:
#   cp .env.db-dump.example .env.db-dump   # fill in prod credentials
#   ./scripts/dump-prod-db.sh
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

OUT_DIR="${DUMP_OUT_DIR:-$ROOT_DIR/sql}"
OUT_FILE="${DUMP_OUT_FILE:-$OUT_DIR/prod-backup.sql}"
TMP_FILE="${OUT_FILE}.tmp.$$"

mkdir -p "$OUT_DIR"

cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

echo "Dumping ${PROD_MYSQL_DATABASE} from ${PROD_MYSQL_HOST}:${PROD_MYSQL_PORT} ..."

mysqldump \
  -h "$PROD_MYSQL_HOST" \
  -P "$PROD_MYSQL_PORT" \
  -u "$PROD_MYSQL_USER" \
  -p"$PROD_MYSQL_PASSWORD" \
  --protocol=TCP \
  --single-transaction \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  "$PROD_MYSQL_DATABASE" > "$TMP_FILE"

if ! grep -q "Dump completed on" "$TMP_FILE"; then
  echo "ERROR: dump looks incomplete (missing 'Dump completed on'). Not replacing $OUT_FILE" >&2
  exit 1
fi

if ! grep -q "Table structure for table \`Users\`" "$TMP_FILE"; then
  echo "ERROR: dump missing Users table. Not replacing $OUT_FILE" >&2
  exit 1
fi

mv -f "$TMP_FILE" "$OUT_FILE"
trap - EXIT

SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "OK: wrote $OUT_FILE ($SIZE) — previous backup replaced."
