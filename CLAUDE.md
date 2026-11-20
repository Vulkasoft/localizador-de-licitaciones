# Localizador de Licitaciones — contexto para Claude

App Next.js 14 + NextAuth + Prisma/PostgreSQL, migrada desde Abacus.AI
(`localizandotudron.abacusai.app`) a un servidor propio. Responde siempre en español:
el usuario no es técnico, así que explica los pasos con lenguaje sencillo.

## Servidor de producción

- VPS de OVH "Servidor de Aplicaciones", Ubuntu 24.04, IP `146.59.225.246`.
- La app está en `/opt/localizador-de-licitaciones` (este repositorio, rama
  `claude/adoring-tesla-btiquq`) y se gestiona con `docker compose` como root.
- Dominio: **https://licitaciones.nexcan.es**.
- `.env` (no está en git) ya existe. `COMPOSE_FILE` incluye
  `deploy/docker-compose.proxy-externo.yml`: el contenedor `app` está en la red
  Docker `licitaciones-entry` con el alias `licitaciones-app`.
- HTTPS: hoy lo da el Caddy de vulka-ai-os (`vulka-ai-os-caddy-1`, con la configuración en
  `/home/ubuntu/vulka-ai-os/Caddyfile`, editado a mano). **Se va a sustituir** por el
  proxy independiente `infra/proxy/` (que se instala en `/opt/proxy`, contenedor
  `proxy-caddy`), con `infra/proxy/migrar-desde-vulka.sh`, en cuanto se fusione
  https://github.com/Vulkasoft/vulka-ai-os/pull/23. Después, el sitio de esta app es
  `/opt/proxy/sites/licitaciones.caddy` y se recarga con `/opt/proxy/recargar.sh`. Lee
  `infra/proxy/README.md`.

### Convivencia con otros proyectos

El servidor aloja varios proyectos y no deben interferir entre sí:
- Cada proyecto tiene su carpeta en `/opt/<proyecto>` (o en `/home/ubuntu/<proyecto>`),
  su propio `docker compose`, su propia BD y sus volúmenes. No compartas bases de datos.
- No publiques puertos al exterior. Los internos van en `127.0.0.1` (este usa el 3000).
- Límites de memoria y CPU en `docker-compose.yml`: app 2 GB / 2 CPU, db 1 GB / 1 CPU,
  ajustables con `APP_MEM_LIMIT`, `APP_CPUS`, `DB_MEM_LIMIT` y `DB_CPUS` en `.env`.
- La única pieza compartida es el proxy (puertos 80/443): `/opt/proxy`, independiente de
  todos los proyectos. Cada web tiene allí su archivo en `sites/`.

### No tocar

En ese servidor corren otros proyectos del usuario: `vulka-ai-os-*`, `vsremote-*`,
`vulkasoft-remote-*` (RustDesk) y Jitsi (`vulkaremote.nexcan.es`). No pares, recrees ni
cambies sus contenedores, redes ni volúmenes sin preguntar antes. No uses
`docker system prune` ni `docker volume prune`.

## Estado (20-11-2026)

Hecho:
- La app está en marcha (`app`, `db`, `cron`) y se publica por Caddy con HTTPS.
- La seguridad está revisada: la API exige sesión y el registro está cerrado salvo
  para el primer usuario o un admin (`ALLOW_SIGNUP`).
- La exportación de la base de datos de Abacus (`licitaciones.sql`, hecha por DeepAgent)
  se probó en local con `scripts/restaurar-bd.sh`: 124 usuarios, 2242 licitaciones,
  477 presupuestos y 1210 clientes, sin errores.

Pendiente, en este orden:
1. **Importar los datos**: el usuario sube `licitaciones.sql` a `/tmp/` y se ejecuta
   `./scripts/restaurar-bd.sh /tmp/licitaciones.sql`. Después hay que borrar
   `/tmp/licitaciones.sql`, porque contiene datos personales.
2. **Completar `.env`** con los valores que el usuario tiene en `claves.txt` (sacado de
   DeepAgent): Contasimple, Google Calendar, Google Drive, BlueDrone, NEXTAUTH_SECRET y
   AGENT_API_KEY. También SMTP (Brevo), ANTHROPIC_API_KEY y el almacenamiento S3 (R2 o
   MinIO). Que el usuario pegue las claves directamente en el servidor (`nano .env`), no
   en el chat. Después: `docker compose up -d`.
3. **Archivos adjuntos**: `scripts/migrar-archivos-desde-abacus.mjs` (ver DESPLIEGUE.md,
   paso 5). Necesita el bucket S3 nuevo con CORS y que la app de Abacus siga activa.
4. **Proxy independiente**: cuando el usuario fusione vulka-ai-os#23, ejecuta
   `infra/proxy/migrar-desde-vulka.sh` como root. Antes, compara
   `docker exec vulka-ai-os-caddy-1 cat /etc/caddy/Caddyfile` con `infra/proxy/sites/`,
   `infra/proxy/extensions/` y `caddy/site.caddy` de vulka-ai-os. Si hay rutas que no
   estén recogidas, añádelas antes de migrar. Con esto la red queda declarada en el
   compose del proxy y es permanente.
5. **Copias de seguridad**: añadir un `pg_dump` diario con rotación (y, si hay bucket,
   una copia fuera del servidor). Recomendar el Backup automático de OVH.
6. **Comprobar en real**: búsqueda PLACSP (`/api/refresh`), envío de correos, análisis
   con IA y subida de archivos.
7. **Apagar Abacus**: última importación de datos y archivos, desactivar sus tareas
   programadas y retirar el despliegue.

Decisiones abiertas: rehacer la búsqueda web con IA cada 12 h que tenía Abacus (TED y
noticias); migrar la otra app de Abacus `localizandotulicitacion.abacusai.app`;
crear un PR a `main`.

## Referencia

- Despliegue y migración: `DESPLIEGUE.md`. Variables: `.env.example`.
- Tareas programadas: `scripts/cron/crontab` (contenedor `cron`, llama a la API con
  `Authorization: Bearer $ALARM_CRON_SECRET`).
- Comprobar tipos: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`.
  Reconstruir: `docker compose up -d --build`.
