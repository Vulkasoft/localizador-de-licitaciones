# Localizador de Licitaciones de Drones

Plataforma de monitorización de licitaciones públicas de drones en España
(PLACSP), con presupuestos, pedidos, alarmas, notas, calendario y sincronización
con Contasimple y Google Calendar.

Originalmente generada y alojada en Abacus.AI (`localizandotudron.abacusai.app`).
Este repositorio contiene la versión adaptada para alojarla en un servidor propio
con Docker.

- Guía de despliegue y migración: **[DESPLIEGUE.md](DESPLIEGUE.md)**
- Stack: Next.js 14, NextAuth, Prisma + PostgreSQL, almacenamiento S3, SMTP, API de Claude.

## Desarrollo local

```bash
cp .env.example .env    # rellena al menos NEXTAUTH_SECRET y POSTGRES_PASSWORD
docker compose up -d db
docker compose run --rm app prisma db push --skip-generate
docker compose up -d --build
```

La app queda en http://localhost:3000.
