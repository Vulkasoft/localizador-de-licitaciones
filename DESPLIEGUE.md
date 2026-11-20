# Despliegue en servidor propio (salir de Abacus)

## Qué ha cambiado respecto a Abacus

| En Abacus | Ahora |
|---|---|
| Base de datos PostgreSQL alojada por Abacus | PostgreSQL 17 en Docker (`db`) |
| Correos con el servicio de notificaciones de Abacus | SMTP propio (`lib/email.ts`, variables `SMTP_*`) |
| IA de Abacus (`gemini-3.5-flash`) para analizar pliegos | API de Claude (`ANTHROPIC_API_KEY`) |
| Bucket S3 privado de Abacus para archivos adjuntos | Cualquier almacenamiento compatible con S3 (`AWS_*`, `S3_*`) |
| Tareas programadas de Abacus (agente) | Contenedor `cron` (`scripts/cron/crontab`) |
| Script `appllm-lib.js` y "error reporter" de Abacus | Eliminados |
| URLs fijas `localizandotudron.abacusai.app` | Se usa `NEXTAUTH_URL` |
| Varias rutas de la API respondían sin iniciar sesión | Exigen sesión (o el secreto del cron) |
| Registro abierto a cualquiera | Cerrado: solo el primer usuario o un admin (`ALLOW_SIGNUP=true` lo abre) |

### Tareas programadas

| Tarea | Frecuencia en Abacus | Ahora (UTC) |
|---|---|---|
| Alarmas por correo (`/api/alarms/process`) | diaria 08:05 | diaria 08:05 |
| Google Calendar (`/api/calendar/google/cron-sync`) | cada hora | cada hora (:33) |
| Contasimple (`/api/contasimple/cron-sync`) | cada hora | cada hora (:37) |
| Nuevas licitaciones PLACSP (`/api/refresh`) | cada 3 días (script Python) | diaria 04:15 |
| Enriquecimiento de pliegos (`/api/enrich-docs`) | puntual | diaria 05:20 |

Se cambian editando `scripts/cron/crontab` y reiniciando: `docker compose restart cron`.

**No migrada:** en Abacus había además una tarea cada 12 h en la que un agente de IA
buscaba licitaciones en la web (PLACSP, TED, noticias) y las insertaba con
`score_tender.py`. No hay equivalente directo; la búsqueda diaria en PLACSP
(`/api/refresh`) cubre la fuente oficial.

## Requisitos del servidor

- Linux con Docker y el plugin Docker Compose (`docker compose version`).
- 2 GB de RAM como mínimo (4 GB recomendado para compilar la imagen).
- Un dominio apuntando (registro A) a la IP del servidor.
- Puertos 80 y 443 abiertos si usas el Caddy incluido.

## Paso a paso

### 1. Descargar el código

```bash
git clone https://github.com/vulkasoft/localizador-de-licitaciones.git
cd localizador-de-licitaciones
```

### 2. Configurar `.env`

```bash
cp .env.example .env
nano .env
```

Imprescindible:
- `DOMAIN` y `NEXTAUTH_URL` (tu dominio).
- `NEXTAUTH_SECRET`: el mismo valor que en Abacus si quieres que las sesiones
  abiertas sigan valiendo, o uno nuevo (`openssl rand -base64 32`).
- `POSTGRES_PASSWORD` y `ALARM_CRON_SECRET` (genera valores nuevos).
- `SMTP_*`: para que lleguen los correos de alarmas y avisos.
- `ANTHROPIC_API_KEY`: para el análisis de pliegos con IA.
- `AWS_*` / `S3_*`: para los archivos adjuntos.
- Contasimple, Google Calendar y BlueDrone: copia los valores del `.env` de Abacus.

### 3. Copiar la base de datos desde Abacus

Usa el `DATABASE_URL` del `.env` que venía en el zip de Abacus
(`localizador_licitaciones/nextjs_space/.env`):

```bash
ABACUS_DATABASE_URL='postgresql://...' ./scripts/migrar-bd-desde-abacus.sh
```

Guarda una copia en `backups/` y la restaura en la base de datos local.
Si prefieres empezar con la base de datos vacía:

```bash
docker compose up -d db
docker compose run --rm app prisma db push --skip-generate
```

### 4. Arrancar la app

Con HTTPS automático (Caddy + Let's Encrypt):

```bash
docker compose --profile https up -d --build
```

Si ya tienes nginx o Apache en el servidor, arranca sin Caddy y apunta tu proxy
a `http://127.0.0.1:3000`:

```bash
docker compose up -d --build
```

Comprueba que todo está en marcha:

```bash
docker compose ps
```

```bash
docker compose logs -f app cron
```

### 5. Copiar los archivos adjuntos desde Abacus

Los archivos de presupuestos, pedidos, notas, alarmas y beneficios están en el
almacenamiento privado de Abacus. Mientras la app de Abacus siga activa, este
script los descarga a través de ella y los sube a tu bucket nuevo con la misma ruta.
Antes, configura en el bucket una regla CORS que permita `GET` y `PUT` desde tu dominio.

```bash
docker compose run --rm \
  -e ABACUS_URL=https://localizandotudron.abacusai.app \
  -e ABACUS_EMAIL=tu@email.com -e ABACUS_PASSWORD='tu-contraseña' \
  -v "$PWD/scripts:/app/scripts:ro" \
  app node scripts/migrar-archivos-desde-abacus.mjs
```

Añade `-e DRY_RUN=true` para ver primero qué copiaría. Se puede repetir sin
duplicar nada.

### 6. Ajustes externos

- **Google Calendar**: en Google Cloud Console, añade la URI de redirección
  `https://TU_DOMINIO/api/calendar/google/callback`.
- **Agente de ChatGPT (MCP)**: cambia la URL del servidor a `https://TU_DOMINIO/api/mcp`.
- **Webhook de BlueDrone Training**: si otro sistema llama a
  `/api/integrations/bluedrone-training/paid-order`, cambia su URL al dominio nuevo.

### 7. Apagar Abacus

Cuando hayas comprobado que todo funciona (login, licitaciones, archivos, correos):
1. Haz una última migración de la base de datos (paso 3) y de los archivos (paso 5)
   para incluir los cambios recientes.
2. Desactiva las tareas programadas de Abacus para que no sigan escribiendo en la
   base de datos de allí.
3. Retira el despliegue de Abacus.

## Mantenimiento

Actualizar a una nueva versión del código:

```bash
git pull && docker compose up -d --build
```

Copia de seguridad de la base de datos:

```bash
docker compose exec -T db pg_dump -U licitaciones -Fc licitaciones > backups/backup-$(date +%F).dump
```
