# Proxy compartido del servidor (/opt/proxy)

Es la única puerta de entrada web del servidor: atiende los puertos 80 y 443, saca los
certificados HTTPS (Let's Encrypt) y pasa cada dominio a su proyecto. Ningún proyecto
publica puertos propios. Cada uno sigue en su propio `docker compose`, con su propia
base de datos y su propia red.

```
Internet ──► proxy-caddy (80/443)
               ├─ vulka-ai-os.caddy   ──red vulka-ai-os_edge────────► api:8000
               │    └─ /vsremote/*    ──red vsremote-pilot-entry────► vsremote-pilot-gateway:8080
               ├─ vulkaremote.nexcan.es ─red vsremote-assist-entry──► vsremote-assist-web:8000
               └─ licitaciones.nexcan.es ─red licitaciones-entry────► licitaciones-app:3000
```

## Archivos

| Ruta | Para qué |
|---|---|
| `compose.yaml` | Contenedor `proxy-caddy`, redes de cada proyecto y volúmenes de certificados |
| `Caddyfile` | Solo importa el resto; no se ponen sitios aquí |
| `sites/<web>.caddy` | Un archivo por web que se define en este proxy |
| `extensions/<proyecto>/*.caddy` | Rutas extra dentro del dominio de otro proyecto (p. ej. `/vsremote/*` bajo Vulka AI OS) |
| `/home/ubuntu/vulka-ai-os/caddy/site.caddy` | Sitio de Vulka AI OS: lo mantiene su repositorio, y aquí se monta en modo solo lectura |
| `.env` | `APP_DOMAIN` (dominio de Vulka AI OS). No va en git |
| `recargar.sh` | Valida y recarga sin cortar las webs |

## Añadir una web nueva

1. En el `docker compose` del proyecto nuevo, conecta su servicio web a una red externa
   propia con un alias:
   ```yaml
   services:
     web:
       networks:
         default: {}
         proxy:
           aliases: [miapp-web]
   networks:
     proxy:
       name: miapp-entry
       external: true
   ```
   Crea la red antes: `docker network create miapp-entry`.
2. Añade la red en `compose.yaml` del proxy (en `services.caddy.networks` y en
   `networks:` con `external: true`) y aplica el cambio con `docker compose up -d` (corta
   las webs unos segundos).
3. Crea `sites/miapp.caddy`:
   ```
   miapp.tudominio.com {
   	reverse_proxy miapp-web:8080
   }
   ```
4. Ejecuta `./recargar.sh`. Si la configuración tiene un error, no se aplica y las webs
   siguen como estaban.

Para quitar una web: borra su archivo de `sites/` y ejecuta `./recargar.sh`.

## Comprobaciones útiles

```bash
docker logs --tail 50 proxy-caddy
```

```bash
docker exec proxy-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

## Origen

Se creó con `migrar-desde-vulka.sh`, que pasó la entrada web del Caddy que vivía dentro
de vulka-ai-os a este proxy y reutilizó sus certificados (volúmenes
`vulka-ai-os_caddy_data` y `vulka-ai-os_caddy_config`). Las copias de la configuración
anterior quedaron en `/root/migracion-proxy-<fecha>/`.
