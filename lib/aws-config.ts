import { S3Client, type S3ClientConfig } from "@aws-sdk/client-s3";

/**
 * Almacenamiento de archivos compatible con S3 (AWS S3, Cloudflare R2, MinIO,
 * Backblaze B2, Wasabi...). Credenciales: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
 *   AWS_REGION            región (en R2 usar "auto")
 *   AWS_BUCKET_NAME       nombre del bucket
 *   AWS_FOLDER_PREFIX     prefijo opcional dentro del bucket (p. ej. "app/")
 *   S3_ENDPOINT           endpoint del proveedor si no es AWS (p. ej. https://<id>.r2.cloudflarestorage.com)
 *   S3_FORCE_PATH_STYLE   "true" para MinIO y algunos proveedores
 *   S3_PUBLIC_URL         URL base pública para archivos públicos (opcional)
 */
export function getBucketConfig() {
  return {
    bucketName: process.env.AWS_BUCKET_NAME ?? "",
    folderPrefix: process.env.AWS_FOLDER_PREFIX ?? "",
  };
}

export function getS3ClientConfig(): S3ClientConfig {
  const config: S3ClientConfig = {};
  if (process.env.AWS_REGION) config.region = process.env.AWS_REGION;
  if (process.env.S3_ENDPOINT) config.endpoint = process.env.S3_ENDPOINT;
  if (process.env.S3_FORCE_PATH_STYLE === "true") config.forcePathStyle = true;
  return config;
}

export function createS3Client() {
  return new S3Client(getS3ClientConfig());
}

/** URL pública de un objeto (solo para archivos marcados como públicos). */
export function getPublicObjectUrl(key: string): string {
  const { bucketName } = getBucketConfig();
  const base = process.env.S3_PUBLIC_URL?.replace(/\/$/, "");
  if (base) return `${base}/${key}`;
  if (process.env.S3_ENDPOINT) {
    return `${process.env.S3_ENDPOINT.replace(/\/$/, "")}/${bucketName}/${key}`;
  }
  return `https://${bucketName}.s3.amazonaws.com/${key}`;
}
