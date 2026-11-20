#!/bin/sh
# Uso: run-job.sh <ruta-api> [timeout-segundos]
# Llama (POST) a un endpoint de la app con el secreto de cron (Authorization: Bearer ALARM_CRON_SECRET).
. /tmp/cron.env
path="$1"; max="${2:-600}"
echo "[$(date -u '+%Y-%m-%d %H:%M:%S')] POST $path"
if out=$(wget -q -O - -T "$max" \
    --header "Authorization: Bearer $ALARM_CRON_SECRET" \
    --header "Content-Type: application/json" \
    --post-data '{}' \
    "$APP_INTERNAL_URL$path" 2>&1); then
  echo "$out" | tail -c 1500; echo; echo "-> OK"
else
  echo "$out" | tail -c 1500; echo; echo "-> ERROR"
  exit 1
fi
