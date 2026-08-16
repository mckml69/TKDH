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
