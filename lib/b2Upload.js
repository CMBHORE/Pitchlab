import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// The bucket stays PRIVATE (no public access, no card needed on
// Backblaze). Instead, our own server generates a temporary, secure
// link whenever a file is uploaded — valid for 7 days, which covers
// normal review timelines.
const SIGNED_URL_SECONDS = 7 * 24 * 60 * 60;

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

  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: key }), { expiresIn: SIGNED_URL_SECONDS });
  return { key, url };
}

// Generates a fresh link for a file already uploaded — use this to
// "refresh" an old link that has expired.
export async function getFreshB2Url(key) {
  const client = getClient();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: key }), { expiresIn: SIGNED_URL_SECONDS });
}

export async function deleteFromB2(key) {
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: process.env.B2_BUCKET_NAME, Key: key }));
}
