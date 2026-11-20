#!/usr/bin/env bash
# Pasa la entrada web del servidor del Caddy de vulka-ai-os al proxy independiente
# (/opt/proxy). Se ejecuta UNA vez, como root, cuando el PR de vulka-ai-os que quita
# su Caddy ya está fusionado en main.
#
#   sudo ./infra/proxy/migrar-desde-vulka.sh
#
# Si cualquier comprobación final falla, vuelve a dejar el Caddy de vulka-ai-os
# tal y como estaba.
set -Eeuo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
VULKA_DIR="${VULKA_DIR:-/home/ubuntu/vulka-ai-os}"
VULKA_USER="${VULKA_USER:-ubuntu}"
PROXY_DIR="${PROXY_DIR:-/opt/proxy}"
OLD=vulka-ai-os-caddy-1
UPDATE_TIMER=vulka-ai-os-update.timer
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="${BACKUP_DIR:-/root/migracion-proxy-$STAMP}"
NETWORKS="vulka-ai-os_edge vsremote-assist-entry vsremote-pilot-entry vsremote-preview-entry licitaciones-entry"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { echo "ERROR: $*" >&2; exit 1; }
as_vulka() { if [ "$(id -un)" = "$VULKA_USER" ]; then "$@"; else sudo -u "$VULKA_USER" "$@"; fi; }

[ "$(id -u)" -eq 0 ] || [ -n "${ALLOW_NON_ROOT:-}" ] || die "ejecútalo como root"

say "1/7 Comprobaciones previas"
docker inspect "$OLD" >/dev/null 2>&1 || die "no encuentro el contenedor $OLD"
[ "$(docker inspect -f '{{.State.Running}}' "$OLD")" = true ] || die "$OLD no está en marcha"
! docker inspect proxy-caddy >/dev/null 2>&1 || die "ya existe un contenedor proxy-caddy"
for n in $NETWORKS; do docker network inspect "$n" >/dev/null 2>&1 || die "falta la red Docker $n"; done
for v in vulka-ai-os_caddy_data vulka-ai-os_caddy_config; do docker volume inspect "$v" >/dev/null 2>&1 || die "falta el volumen $v"; done
APP_DOMAIN="$(sed -n 's/^APP_DOMAIN=//p' "$VULKA_DIR/.env" | tail -n 1)"
[ -n "$APP_DOMAIN" ] || die "no encuentro APP_DOMAIN en $VULKA_DIR/.env"
as_vulka git -C "$VULKA_DIR" fetch --quiet origin main
as_vulka git -C "$VULKA_DIR" cat-file -e origin/main:caddy/site.caddy 2>/dev/null ||
  die "el PR que quita Caddy de vulka-ai-os aún no está fusionado en main"
echo "Dominio de Vulka AI OS: $APP_DOMAIN"

say "2/7 Copia de seguridad en $BACKUP"
mkdir -p "$BACKUP"; chmod 700 "$BACKUP"
docker exec "$OLD" cat /etc/caddy/Caddyfile > "$BACKUP/Caddyfile.en-uso"
[ -f "$VULKA_DIR/Caddyfile" ] && cp -p "$VULKA_DIR/Caddyfile" "$BACKUP/Caddyfile.host"
as_vulka git -C "$VULKA_DIR" rev-parse HEAD > "$BACKUP/vulka-commit"
docker inspect "$OLD" > "$BACKUP/$OLD.inspect.json"
TIMER_WAS_ACTIVE=no
if systemctl is-active --quiet "$UPDATE_TIMER" 2>/dev/null; then
  TIMER_WAS_ACTIVE=yes; systemctl stop "$UPDATE_TIMER"
fi
echo "Actualizador de vulka-ai-os parado durante la migración (estaba activo: $TIMER_WAS_ACTIVE)"

restore_timer() { [ "$TIMER_WAS_ACTIVE" = yes ] && systemctl start "$UPDATE_TIMER" || true; }

say "3/7 Poniendo vulka-ai-os en la versión sin Caddy"
# El único cambio local esperado es el Caddyfile editado a mano (ya respaldado).
as_vulka git -C "$VULKA_DIR" checkout -- Caddyfile 2>/dev/null || true
if ! as_vulka git -C "$VULKA_DIR" diff --quiet || ! as_vulka git -C "$VULKA_DIR" diff --cached --quiet ||
   [ -n "$(as_vulka git -C "$VULKA_DIR" ls-files --others --exclude-standard)" ]; then
  [ -f "$BACKUP/Caddyfile.host" ] && cp -p "$BACKUP/Caddyfile.host" "$VULKA_DIR/Caddyfile"
  restore_timer
  die "vulka-ai-os tiene otros cambios locales; no sigo (revisa: git -C $VULKA_DIR status)"
fi
as_vulka git -C "$VULKA_DIR" merge --ff-only --quiet origin/main
[ -f "$VULKA_DIR/caddy/site.caddy" ] || die "falta $VULKA_DIR/caddy/site.caddy tras actualizar"

rollback() {
  local status=$?
  trap - ERR
  echo
  echo "!! Algo ha fallado: vuelvo a dejarlo como estaba." >&2
  ( cd "$PROXY_DIR" && docker compose down ) >/dev/null 2>&1 || true
  as_vulka git -C "$VULKA_DIR" reset --hard --quiet "$(cat "$BACKUP/vulka-commit")" || true
  cp -p "$BACKUP/Caddyfile.host" "$VULKA_DIR/Caddyfile" 2>/dev/null || cp "$BACKUP/Caddyfile.en-uso" "$VULKA_DIR/Caddyfile"
  docker start "$OLD" >/dev/null && echo "Caddy de vulka-ai-os restaurado." >&2
  restore_timer
  echo "Copias en $BACKUP" >&2
  exit "$status"
}
trap rollback ERR

say "4/7 Instalando el proxy en $PROXY_DIR"
mkdir -p "$PROXY_DIR"
if [ "$SRC" != "$PROXY_DIR" ]; then
  cp -r "$SRC/Caddyfile" "$SRC/compose.yaml" "$SRC/recargar.sh" "$SRC/.gitignore" "$SRC/sites" "$SRC/extensions" "$PROXY_DIR/"
  [ -f "$SRC/README.md" ] && cp "$SRC/README.md" "$PROXY_DIR/"
fi
printf 'APP_DOMAIN=%s\n' "$APP_DOMAIN" > "$PROXY_DIR/.env"
chmod +x "$PROXY_DIR/recargar.sh"
cd "$PROXY_DIR"
docker compose config --quiet
docker compose run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -1

say "5/7 Cambio de Caddy (unos segundos sin web)"
docker stop "$OLD" >/dev/null
docker compose up -d

say "6/7 Comprobando las webs"
check() { # check host ruta
  local code i
  for i in $(seq 1 12); do
    code=$(curl -sk --noproxy '*' -o /dev/null -w '%{http_code}' --max-time 10 \
      --resolve "$1:443:127.0.0.1" "https://$1$2" || true)
    case "$code" in 2??|3??|401|403) echo "  OK  https://$1$2 ($code)"; return 0 ;; esac
    sleep 5
  done
  echo "  MAL https://$1$2 (código $code)"; return 1
}
check "$APP_DOMAIN" /login
check vulkaremote.nexcan.es /
check licitaciones.nexcan.es /login
trap - ERR

say "7/7 Limpieza"
docker rm "$OLD" >/dev/null
restore_timer
# Historial local de cambios del proxy (el .env queda fuera por .gitignore)
( cd "$PROXY_DIR" && { [ -d .git ] || git init -q; } && git add -A &&
  git -c user.name=servidor -c user.email=servidor@localhost commit -qm "Proxy compartido del servidor" ) >/dev/null 2>&1 || true
echo "Listo. La entrada web es ahora el proxy independiente ($PROXY_DIR)."
echo "Copias de seguridad de la configuración anterior en $BACKUP"
