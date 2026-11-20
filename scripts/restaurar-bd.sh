#!/usr/bin/env bash
# Restaura en la base de datos local una copia exportada (por ejemplo, la que genera
# DeepAgent en Abacus). Acepta:
#   - SQL plano:            licitaciones.sql  (o .sql.gz)
#   - formato personalizado: licitaciones.dump (pg_dump -Fc)
#
# Uso (en el servidor, dentro de la carpeta del proyecto):
#   ./scripts/restaurar-bd.sh /ruta/al/archivo.sql
#
# ATENCIÓN: borra los datos actuales de la base de datos local y los sustituye.
# Antes guarda automáticamente una copia de lo que hay en backups/.
set -euo pipefail
cd "$(dirname "$0")/.."

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Uso: $0 /ruta/al/archivo.sql|.sql.gz|.dump" >&2
  exit 1
fi

envval() { [ -f .env ] && grep -E "^$1=" .env | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' || true; }
U="$(envval POSTGRES_USER)"; U="${U:-licitaciones}"
D="$(envval POSTGRES_DB)"; D="${D:-licitaciones}"

docker compose up -d db
until docker compose exec -T db pg_isready -U "$U" -d "$D" >/dev/null 2>&1; do sleep 2; done

mkdir -p backups
SAFE="backups/antes-de-restaurar-$(date +%Y%m%d-%H%M%S).dump"
echo "==> Copia de seguridad de la BD actual en $SAFE"
docker compose exec -T db pg_dump -U "$U" -d "$D" -Fc > "$SAFE"

echo "==> Parando la app mientras se restaura"
docker compose stop app cron >/dev/null

echo "==> Vaciando la base de datos local"
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$U" -d "$D" -q \
  -c "SET client_min_messages = warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "==> Restaurando $FILE"
case "$FILE" in
  *.dump|*.backup)
    docker compose exec -T db pg_restore --no-owner --no-privileges --disable-triggers -U "$U" -d "$D" < "$FILE" || \
      echo "pg_restore terminó con avisos; revisa los mensajes de arriba." >&2 ;;
  *.gz)
    { echo "SET session_replication_role = replica;"; gunzip -c "$FILE" | grep -vE '^(ALTER .* OWNER TO|GRANT |REVOKE )'; } | \
      docker compose exec -T db psql -U "$U" -d "$D" -q ;;
  *)
    # session_replication_role=replica: no comprueba claves foráneas durante la carga,
    # porque algunas exportaciones (p. ej. la de DeepAgent) insertan las tablas por orden alfabético.
    { echo "SET session_replication_role = replica;"; grep -vE '^(ALTER .* OWNER TO|GRANT |REVOKE )' "$FILE"; } | \
      docker compose exec -T db psql -U "$U" -d "$D" -q ;;
esac

echo "==> Comprobando que el esquema coincide con el de la app"
docker compose run --rm --no-deps app prisma db push --skip-generate

echo "==> Arrancando la app"
docker compose up -d

echo "==> Filas en algunas tablas"
docker compose exec -T db psql -U "$U" -d "$D" -c \
  'SELECT (SELECT count(*) FROM "User") AS usuarios, (SELECT count(*) FROM "Tender") AS licitaciones, (SELECT count(*) FROM "Budget") AS presupuestos;'
echo "Listo. Si algo salió mal, puedes volver atrás con:  ./scripts/restaurar-bd.sh $SAFE"
