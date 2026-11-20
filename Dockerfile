# syntax=docker/dockerfile:1

# ---------- Dependencias ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ---------- Compilación ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Valores ficticios solo para compilar; los reales se pasan al arrancar.
RUN npx prisma generate && \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" NEXTAUTH_SECRET="build" \
    NODE_OPTIONS=--max-old-space-size=4096 npm run build

# ---------- Ejecución ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/* \
    && npm install -g prisma@6.7.0 --no-audit --no-fund
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

USER node
EXPOSE 3000
CMD ["node", "server.js"]
