#!/bin/sh
# Contenedor de tareas programadas: arranca crond (busybox) con scripts/cron/crontab.
# No instala nada: usa el wget de busybox que trae alpine.
set -e
if [ -z "$ALARM_CRON_SECRET" ]; then
  echo "[cron] Falta ALARM_CRON_SECRET en .env" >&2
  exit 1
fi
# Exporta las variables necesarias para que las vean los trabajos de cron.
printf 'export APP_INTERNAL_URL="%s"\nexport ALARM_CRON_SECRET="%s"\n' "$APP_INTERNAL_URL" "$ALARM_CRON_SECRET" > /tmp/cron.env
cp /cron/crontab /etc/crontabs/root
echo "[cron] Tareas programadas cargadas (horas en UTC):"; grep -v '^#' /etc/crontabs/root | grep -v '^$'
exec crond -f -l 6
