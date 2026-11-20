#!/usr/bin/env node
/**
 * Copia los archivos adjuntos del almacenamiento de Abacus al bucket S3 nuevo.
 *
 * Los archivos (presupuestos, pedidos, notas, alarmas, repartos de beneficios)
 * están en un bucket privado de Abacus al que solo accede la app desplegada allí.
 * Este script inicia sesión en la app de Abacus (que sigue funcionando), pide a esa
 * app el enlace de descarga de cada archivo, lo descarga y lo sube al bucket nuevo
 * con la misma ruta (s3Key), así la base de datos migrada sigue siendo válida.
 *
 * Requisitos: la BD ya migrada (scripts/migrar-bd-desde-abacus.sh) y el bucket nuevo
 * configurado en .env.
 *
 * Uso (desde la carpeta del proyecto, en el servidor):
 *   docker compose run --rm \
 *     -e ABACUS_URL=https://localizandotudron.abacusai.app \
 *     -e ABACUS_EMAIL=tu@email.com -e ABACUS_PASSWORD='tu-contraseña' \
 *     -v "$PWD/scripts:/app/scripts:ro" \
 *     app node scripts/migrar-archivos-desde-abacus.mjs
 *
 * Opcional: -e DRY_RUN=true para solo listar lo que copiaría.
 * Se puede ejecutar varias veces: salta los archivos que ya existen en el bucket nuevo.
 */
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const ABACUS_URL = (process.env.ABACUS_URL || "https://localizandotudron.abacusai.app").replace(/\/$/, "");
const EMAIL = process.env.ABACUS_EMAIL;
const PASSWORD = process.env.ABACUS_PASSWORD;
const DRY_RUN = process.env.DRY_RUN === "true";
const BUCKET = process.env.AWS_BUCKET_NAME;

if (!EMAIL || !PASSWORD) {
  console.error("Faltan ABACUS_EMAIL y ABACUS_PASSWORD (un usuario de la app en Abacus).");
  process.exit(1);
}
if (!BUCKET && !DRY_RUN) {
  console.error("Falta AWS_BUCKET_NAME (bucket nuevo) en .env.");
  process.exit(1);
}

const s3Config = {};
if (process.env.AWS_REGION) s3Config.region = process.env.AWS_REGION;
if (process.env.S3_ENDPOINT) s3Config.endpoint = process.env.S3_ENDPOINT;
if (process.env.S3_FORCE_PATH_STYLE === "true") s3Config.forcePathStyle = true;
const s3 = new S3Client(s3Config);
const prisma = new PrismaClient();

// ---------- Sesión en la app de Abacus ----------
const cookies = new Map();
function storeCookies(res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of list) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
const cookieHeader = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");

async function login() {
  const csrfRes = await fetch(`${ABACUS_URL}/api/auth/csrf`);
  storeCookies(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, json: "true" });
  const res = await fetch(`${ABACUS_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
    body,
    redirect: "manual",
  });
  storeCookies(res);
  const session = await fetch(`${ABACUS_URL}/api/auth/session`, { headers: { Cookie: cookieHeader() } }).then((r) => r.json());
  if (!session?.user) throw new Error("No se pudo iniciar sesión en Abacus: revisa email y contraseña.");
  console.log(`Sesión iniciada en ${ABACUS_URL} como ${session.user.email}`);
}

// ---------- Archivos a copiar ----------
const SOURCES = [
  { label: "presupuestos", model: "budgetFile", parent: "budgetId", path: "budgets" },
  { label: "alarmas", model: "alarmFile", parent: "alarmId", path: "alarms" },
  { label: "notas", model: "noteFile", parent: "noteId", path: "notes" },
  { label: "pedidos", model: "orderFile", parent: "orderId", path: "orders" },
  { label: "beneficios", model: "profitShareFile", parent: "profitShareId", path: "profit-shares" },
];

async function getSignedUrl(src, file) {
  const res = await fetch(`${ABACUS_URL}/api/${src.path}/${file[src.parent]}/files/${file.id}/download`, {
    headers: { Cookie: cookieHeader() },
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400) return res.headers.get("location");
  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    if (data?.url) return data.url;
  }
  throw new Error(`la app de Abacus respondió HTTP ${res.status}`);
}

async function existsInNewBucket(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await login();
  let copied = 0, skipped = 0, failed = 0;
  for (const src of SOURCES) {
    const files = await prisma[src.model].findMany();
    console.log(`\n== ${src.label}: ${files.length} archivo(s)`);
    for (const file of files) {
      const tag = `${src.label}/${file.filename}`;
      try {
        if (DRY_RUN) { console.log(`  [dry-run] ${tag} -> ${file.s3Key}`); continue; }
        if (await existsInNewBucket(file.s3Key)) { skipped++; continue; }
        const url = await getSignedUrl(src, file);
        const dl = await fetch(url);
        if (!dl.ok) throw new Error(`descarga HTTP ${dl.status}`);
        const buffer = Buffer.from(await dl.arrayBuffer());
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: file.s3Key,
          Body: buffer,
          ContentType: dl.headers.get("content-type") || "application/octet-stream",
        }));
        copied++;
        console.log(`  ✓ ${tag} (${(buffer.length / 1024).toFixed(0)} KB)`);
      } catch (e) {
        failed++;
        console.error(`  ✗ ${tag}: ${e.message}`);
      }
    }
  }
  console.log(`\nResumen: ${copied} copiados, ${skipped} ya existían, ${failed} con error.`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
