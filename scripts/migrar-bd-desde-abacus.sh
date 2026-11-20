#!/usr/bin/env bash
# Copia la base de datos de Abacus a la base de datos local de Docker.
#
# Uso (en tu servidor, dentro de la carpeta del proyecto):
#   ABACUS_DATABASE_URL='postgresql://usuario:clave@host:5432/bd' ./scripts/migrar-bd-desde-abacus.sh
#
# La URL de Abacus es el DATABASE_URL del .env que venía en el zip exportado.
# El script:
#   1. hace una copia (pg_dump) de la BD de Abacus en ./backups/
#   2. la restaura en el contenedor "db" (borrando lo que hubiera en la BD local)
set -euo pipefail

if [ -z "${ABACUS_DATABASE_URL:-}" ]; then
  echo "Falta ABACUS_DATABASE_URL. Ejemplo:" >&2
  echo "  ABACUS_DATABASE_URL='postgresql://...' $0" >&2
  exit 1
fi

# Lee solo las variables necesarias del .env (sin ejecutarlo).
envval() { [ -f .env ] && grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
PGUSER_LOCAL="$(envval POSTGRES_USER)"; PGUSER_LOCAL="${PGUSER_LOCAL:-licitaciones}"
PGDB_LOCAL="$(envval POSTGRES_DB)"; PGDB_LOCAL="${PGDB_LOCAL:-licitaciones}"

mkdir -p backups
DUMP="backups/abacus-$(date +%Y%m%d-%H%M%S).dump"

echo "==> 1/3 Descargando copia de la BD de Abacus en $DUMP ..."
docker run --rm ${DOCKER_NETWORK:+--network "$DOCKER_NETWORK"} -v "$PWD/backups:/backups" postgres:17 \
  pg_dump "$ABACUS_DATABASE_URL" --format=custom --no-owner --no-privileges \
  --file="/backups/$(basename "$DUMP")"
ls -lh "$DUMP"

echo "==> 2/3 Arrancando la BD local ..."
docker compose up -d db
until docker compose exec -T db pg_isready -U "$PGUSER_LOCAL" -d "$PGDB_LOCAL" >/dev/null 2>&1; do sleep 2; done

echo "==> 3/3 Restaurando en la BD local (se sobrescriben las tablas existentes) ..."
docker compose exec -T db pg_restore --clean --if-exists --no-owner --no-privileges \
  -U "$PGUSER_LOCAL" -d "$PGDB_LOCAL" "/backups/$(basename "$DUMP")" || {
  echo "pg_restore terminó con avisos; revisa los mensajes de arriba." >&2
}

echo "==> Comprobación: número de filas en algunas tablas"
docker compose exec -T db psql -U "$PGUSER_LOCAL" -d "$PGDB_LOCAL" -c \
  'SELECT (SELECT count(*) FROM "User") AS usuarios, (SELECT count(*) FROM "Tender") AS licitaciones;' || true

echo "Listo. Arranca la app con:  docker compose up -d --build"
