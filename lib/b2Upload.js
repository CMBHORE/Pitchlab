import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Backblaze B2 speaks the same S3-compatible API as R2 — just a
// different endpoint and different keys. Static credentials, no OAuth,
// no weekly expiry.
function getClient() {
  return new S3Client({
    region: "us-west-004", // adjust if your bucket's region differs — shown on the bucket's details page
    endpoint: `https://${process.env.B2_ENDPOINT}`,
    credentials: {
      accessKeyId: process.env.B2_KEY_ID,
      secretAccessKey: process.env.B2_APPLICATION_KEY,
    },
  });
}

export async function uploadToB2(base64Data, filename, mimeType) {
  const client = getClient();
  const buffer = Buffer.from(base64Data, "base64");
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${filename}`.replace(/\s+/g, "_");

  await client.send(new PutObjectCommand({
    Bucket: process.env.B2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimeType || "application/octet-stream",
  }));

  const publicUrl = `${process.env.B2_PUBLIC_URL}/${key}`;
  return { key, url: publicUrl };
}

export async function deleteFromB2(key) {
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: key }));
}
