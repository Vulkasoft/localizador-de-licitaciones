import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getBucketConfig, createS3Client } from "./aws-config";

const config = getBucketConfig();
const s3Client = createS3Client();

export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  isPublic: boolean = false
) {
  try {
    const timestamp = Date.now();
    const cloud_storage_path = isPublic
      ? `${config.folderPrefix}public/uploads/${timestamp}-${fileName}`
      : `${config.folderPrefix}uploads/${timestamp}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: cloud_storage_path,
      ContentType: contentType,
      ContentDisposition: isPublic ? "attachment" : undefined,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    return {
      uploadUrl,
      cloud_storage_path,
    };
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    throw new Error("Failed to generate upload URL");
  }
}

export async function initiateMultipartUpload(
  fileName: string,
  isPublic: boolean = false
) {
  try {
    const timestamp = Date.now();
    const cloud_storage_path = isPublic
      ? `${config.folderPrefix}public/uploads/${timestamp}-${fileName}`
      : `${config.folderPrefix}uploads/${timestamp}-${fileName}`;

    const command = new CreateMultipartUploadCommand({
      Bucket: config.bucketName,
      Key: cloud_storage_path,
      ContentDisposition: isPublic ? "attachment" : undefined,
    });

    const response = await s3Client.send(command);

    return {
      uploadId: response.UploadId,
      cloud_storage_path,
    };
  } catch (error) {
    console.error("Error initiating multipart upload:", error);
    throw new Error("Failed to initiate multipart upload");
  }
}

export async function getPresignedUrlForPart(
  cloud_storage_path: string,
  uploadId: string,
  partNumber: number
) {
  try {
    const command = new UploadPartCommand({
      Bucket: config.bucketName,
      Key: cloud_storage_path,
      PartNumber: partNumber,
      UploadId: uploadId,
    });

    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    return presignedUrl;
  } catch (error) {
    console.error("Error getting presigned URL for part:", error);
    throw new Error("Failed to get presigned URL for part");
  }
}

export async function completeMultipartUpload(
  cloud_storage_path: string,
  uploadId: string,
  parts: Array<{ ETag: string; PartNumber: number }>
) {
  try {
    const command = new CompleteMultipartUploadCommand({
      Bucket: config.bucketName,
      Key: cloud_storage_path,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });

    await s3Client.send(command);
    return { success: true, cloud_storage_path };
  } catch (error) {
    console.error("Error completing multipart upload:", error);
    throw new Error("Failed to complete multipart upload");
  }
}

// Build an RFC 6266 / RFC 5987 compliant Content-Disposition value.
// S3 requires the response-content-disposition header to be representable in
// ISO-8859-1, so filenames with non-ASCII characters (á, ñ, ó, …) must use the
// filename*=UTF-8'' extended form, with an ASCII fallback in plain filename="".
function buildContentDisposition(filename: string): string {
  // ASCII fallback: replace any non-ASCII char (and quotes) with "_".
  const asciiFallback = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/"/g, "_");
  // Extended form: UTF-8 percent-encoded (encodeURIComponent covers RFC 5987
  // attr-char requirements adequately for filenames).
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function getFileUrl(
  cloud_storage_path: string,
  isPublic: boolean,
  downloadFilename?: string,
  expiresInSeconds?: number
): Promise<string> {
  try {
    if (isPublic) {
      return `https://${config.bucketName}.s3.amazonaws.com/${cloud_storage_path}`;
    } else {
      const disposition = downloadFilename
        ? buildContentDisposition(downloadFilename)
        : "attachment";
      const command = new GetObjectCommand({
        Bucket: config.bucketName,
        Key: cloud_storage_path,
        ResponseContentDisposition: disposition,
      });

      const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: expiresInSeconds ?? 3600,
      });

      return signedUrl;
    }
  } catch (error) {
    console.error("Error getting file URL:", error);
    throw new Error("Failed to get file URL");
  }
}

export async function getFileUrlForPreview(
  cloud_storage_path: string,
  isPublic: boolean
): Promise<string> {
  try {
    if (isPublic) {
      return `https://${config.bucketName}.s3.amazonaws.com/${cloud_storage_path}`;
    } else {
      const command = new GetObjectCommand({
        Bucket: config.bucketName,
        Key: cloud_storage_path,
        // Sin ResponseContentDisposition para permitir visualización en navegador
      });

      const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600,
      });

      return signedUrl;
    }
  } catch (error) {
    console.error("Error getting file URL for preview:", error);
    throw new Error("Failed to get file URL");
  }
}

export async function deleteFile(cloud_storage_path: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: cloud_storage_path,
    });

    await s3Client.send(command);
  } catch (error) {
    console.error("Error deleting file:", error);
    throw new Error("Failed to delete file");
  }
}

/**
 * Upload a raw buffer to storage from the server (e.g. a PDF fetched from
 * Contasimple). Returns the cloud storage path (S3 key).
 */
export async function uploadBuffer(
  fileName: string,
  buffer: Buffer,
  contentType: string,
  isPublic: boolean = false
): Promise<{ cloud_storage_path: string }> {
  const timestamp = Date.now();
  const cloud_storage_path = isPublic
    ? `${config.folderPrefix}public/uploads/${timestamp}-${fileName}`
    : `${config.folderPrefix}uploads/${timestamp}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: cloud_storage_path,
    Body: buffer,
    ContentType: contentType,
    ContentDisposition: isPublic ? "attachment" : undefined,
  });

  await s3Client.send(command);
  return { cloud_storage_path };
}
