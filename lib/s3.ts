import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3ClientConfig } from './aws-config';

const BUCKET = process.env.AWS_BUCKET_NAME ?? '';
const PREFIX = (process.env.AWS_FOLDER_PREFIX ?? '').replace(/\/$/, '');

export const s3 = new S3Client({ region: 'us-west-2', ...getS3ClientConfig() });

export function buildKey(suffix: string): string {
  const clean = suffix.replace(/^\//, '');
  return PREFIX ? `${PREFIX}/${clean}` : clean;
}

export async function uploadBuffer(key: string, buffer: Buffer, contentType: string, filename?: string): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ContentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
  }));
}

export async function getSignedDownloadUrl(key: string, filename?: string, expiresIn = 3600): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ResponseContentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
  });
  return getSignedUrl(s3, cmd, { expiresIn });
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch { return false; }
}
