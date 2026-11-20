#!/usr/bin/env bash
# Instalador para un servidor nuevo (Ubuntu/Debian), pensado para ejecutarse una vez.
#
#   cd localizador-de-licitaciones
#   sudo ./scripts/instalar-servidor.sh
#
# Hace lo siguiente:
#   1. Instala Docker si no está.
#   2. Crea el archivo .env preguntando lo imprescindible y generando contraseñas.
#   3. Copia la base de datos desde Abacus (si le das la URL) o crea una vacía.
#   4. Arranca la app con HTTPS (Caddy + Let's Encrypt).
# Se puede volver a ejecutar: no sobrescribe un .env existente.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecútalo como root:  sudo $0" >&2
  exit 1
fi

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ask() { # ask VAR "Pregunta" [valor_por_defecto]
  local var="$1" prompt="$2" def="${3:-}" ans
  if [ -n "$def" ]; then read -r -p "$prompt [$def]: " ans; ans="${ans:-$def}"; else read -r -p "$prompt: " ans; fi
  printf -v "$var" '%s' "$ans"
}
set_env() { # set_env CLAVE valor  -> escribe/reemplaza CLAVE=valor en .env
  local key="$1" val="$2" tmp
  tmp="$(mktemp)"
  if grep -qE "^#? ?${key}=" .env; then
    K="$key" V="$val" awk 'BEGIN{k=ENVIRON["K"]; v=ENVIRON["V"]; done=0} { if (!done && ($0 ~ "^"k"=" || $0 ~ "^# ?"k"=")) { print k"="v; done=1 } else print }' .env > "$tmp"
  else
    cp .env "$tmp"; printf '%s=%s\n' "$key" "$val" >> "$tmp"
  fi
  cat "$tmp" > .env; rm -f "$tmp"
}
gen() { openssl rand -hex "${1:-24}"; }

# ---------- 1. Docker ----------
say "1/4 Comprobando Docker"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y curl ca-certificates openssl
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null
command -v openssl >/dev/null || apt-get install -y openssl
echo "Docker listo: $(docker --version)"

# ---------- 2. Configuración ----------
say "2/4 Configuración (.env)"
if [ -f .env ]; then
  echo "Ya existe .env; no lo toco. (Para empezar de cero: borra .env y vuelve a ejecutar.)"
else
  cp .env.example .env
  chmod 600 .env
  ask DOMAIN "Dominio de la app (p. ej. licitaciones.tudominio.com)"
  set_env DOMAIN "$DOMAIN"
  set_env NEXTAUTH_URL "https://$DOMAIN"
  ask NEXTAUTH_SECRET "NEXTAUTH_SECRET de Abacus (Enter para generar uno nuevo; habrá que volver a iniciar sesión)" ""
  set_env NEXTAUTH_SECRET "${NEXTAUTH_SECRET:-$(openssl rand -base64 32)}"
  set_env POSTGRES_PASSWORD "$(gen 24)"
  set_env ALARM_CRON_SECRET "$(gen 24)"
  ask AGENT_API_KEY "AGENT_API_KEY del agente de ChatGPT (Enter para generar una nueva)" ""
  set_env AGENT_API_KEY "${AGENT_API_KEY:-$(gen 24)}"

  echo
  echo "Correo (SMTP). Con Brevo: servidor smtp-relay.brevo.com, puerto 587,"
  echo "usuario = 'login SMTP' y contraseña = 'clave SMTP' del panel de Brevo."
  echo "(Enter para dejarlo en blanco y rellenarlo después en .env)"
  ask SMTP_HOST "Servidor SMTP" "smtp-relay.brevo.com"; set_env SMTP_HOST "$SMTP_HOST"
  ask SMTP_PORT "Puerto SMTP" "587"; set_env SMTP_PORT "$SMTP_PORT"
  ask SMTP_USER "Usuario SMTP" ""; set_env SMTP_USER "$SMTP_USER"
  read -r -s -p "Contraseña SMTP: " SMTP_PASSWORD; echo; set_env SMTP_PASSWORD "$SMTP_PASSWORD"
  ask SMTP_FROM "Remitente de los correos" "avisos@${DOMAIN#*.}"; set_env SMTP_FROM "$SMTP_FROM"

  echo
  read -r -s -p "Clave API de Anthropic para el análisis de pliegos (Enter para omitir): " ANTHROPIC_API_KEY; echo
  set_env ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"

  echo
  echo "Archivos adjuntos en Cloudflare R2 (Enter para omitir y configurarlo después)."
  ask R2_ACCOUNT "ID de cuenta de Cloudflare" ""
  if [ -n "$R2_ACCOUNT" ]; then
    ask AWS_BUCKET_NAME "Nombre del bucket R2" "licitaciones"; set_env AWS_BUCKET_NAME "$AWS_BUCKET_NAME"
    ask AWS_ACCESS_KEY_ID "Access Key ID del token de R2" ""; set_env AWS_ACCESS_KEY_ID "$AWS_ACCESS_KEY_ID"
    read -r -s -p "Secret Access Key del token de R2: " AWS_SECRET_ACCESS_KEY; echo; set_env AWS_SECRET_ACCESS_KEY "$AWS_SECRET_ACCESS_KEY"
    set_env AWS_REGION "auto"
    set_env S3_ENDPOINT "https://${R2_ACCOUNT}.r2.cloudflarestorage.com"
  fi
  echo
  echo "Contasimple, Google Calendar y BlueDrone se pueden añadir después editando .env:"
  echo "  nano .env    y luego    docker compose up -d"
fi

# ---------- 3. Base de datos ----------
say "3/4 Base de datos"
ask ABACUS_DATABASE_URL "URL de la base de datos de Abacus para copiar los datos (Enter para empezar vacía)" ""
if [ -n "$ABACUS_DATABASE_URL" ]; then
  ABACUS_DATABASE_URL="$ABACUS_DATABASE_URL" ./scripts/migrar-bd-desde-abacus.sh
else
  docker compose up -d db
  until docker compose exec -T db pg_isready >/dev/null 2>&1; do sleep 2; done
  docker compose build app
  docker compose run --rm --no-deps app prisma db push --skip-generate
fi

# ---------- 4. Arranque ----------
say "4/4 Arrancando la app"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi
docker compose --profile https up -d --build
docker compose ps

DOMAIN_NOW="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"
say "Listo"
echo "Abre https://${DOMAIN_NOW} (el certificado HTTPS puede tardar un minuto la primera vez)."
echo "El dominio debe apuntar (registro A) a la IP de este servidor: $(curl -fsS -4 https://ifconfig.me 2>/dev/null || echo '?')"
echo "Ver registros:   docker compose logs -f app cron caddy"
