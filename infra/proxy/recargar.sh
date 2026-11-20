#!/bin/sh
# Valida la configuración y, solo si es correcta, la recarga sin cortar las webs.
set -e
docker exec proxy-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec proxy-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
echo "Proxy recargado."
