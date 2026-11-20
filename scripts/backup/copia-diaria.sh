#!/bin/sh
# Copia de seguridad diaria de la base de datos (servicio "backup" de docker-compose).
# Cada día a la hora BACKUP_HOUR (UTC) guarda backups/diaria-AAAAMMDD-HHMM.dump
# (formato pg_dump -Fc) y borra las copias diarias con más de BACKUP_KEEP_DAYS días.
# Restaurar una copia:  ./scripts/restaurar-bd.sh backups/diaria-....dump
set -eu
HOUR="${BACKUP_HOUR:-3}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
DIR=/backups

hacer_copia() {
  f="$DIR/diaria-$(date -u +%Y%m%d-%H%M).dump"
  if pg_dump -h db -U "$PGUSER" -d "$PGDATABASE" -Fc -f "$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "[backup] $(date -u '+%F %T') copia guardada: $f ($(du -h "$f" | cut -f1))"
    find "$DIR" -maxdepth 1 -name 'diaria-*.dump' -mtime +"$((KEEP - 1))" -print -delete | sed 's/^/[backup] borrada copia antigua: /'
  else
    rm -f "$f.tmp"
    echo "[backup] $(date -u '+%F %T') ERROR: no se pudo hacer la copia" >&2
  fi
}

echo "[backup] Copia diaria a las $HOUR:00 UTC, se guardan $KEEP días."
while :; do
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%F) $HOUR:00:00" +%s)
  [ "$next" -gt "$now" ] || next=$((next + 86400))
  sleep $((next - now))
  hacer_copia
  sleep 60
done
