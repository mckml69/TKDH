import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 (S3-compatible) client for attachment storage. Entirely optional —
 * if these env vars aren't set, r2Enabled is false and index.js falls back to storing
 * attachments as base64 directly in kv_store, exactly like before. This keeps local
 * dev ("npm install && npm start") working with zero cloud credentials, same two-phase
 * pattern as auth.js's authIsActive().
 */
const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;

export const r2Enabled = Boolean(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);

const client = r2Enabled
  ? new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      // R2 doesn't support the AWS SDK's newer default flexible-checksum headers on
      // requests/responses — leaving these on the SDK's default ("WHEN_SUPPORTED")
      // makes PutObject/GetObject fail against R2. This is a documented Cloudflare
      // R2 + aws-sdk-js-v3 compatibility gotcha, not something specific to this app.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    })
  : null;

export async function putAttachment(key, buffer, mime) {
  await client.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: buffer, ContentType: mime }));
}

export async function getAttachment(key) {
  const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  const bytes = await res.Body.transformToByteArray();
  return { buffer: Buffer.from(bytes), mime: res.ContentType || "application/octet-stream" };
}

export async function deleteAttachment(key) {
  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
}
