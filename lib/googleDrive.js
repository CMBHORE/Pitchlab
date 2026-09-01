import crypto from "crypto";

// Builds and signs a JWT for the service account, then exchanges it for a
// short-lived access token — done with Node's built-in crypto module only,
// so this doesn't need the (heavier) official googleapis package installed.
async function getAccessToken() {
  const keyJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: keyJson.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = base64url(header) + "." + base64url(claimSet);

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(keyJson.private_key).toString("base64url");
  const jwt = unsigned + "." + signature;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Google auth failed: " + (data.error_description || data.error || res.status));
  return data.access_token;
}

// Uploads a file (as a base64 string) into the shared Drive folder, makes
// it viewable by link, and returns a direct URL usable in an <img>/<video>
// tag or for later download.
export async function uploadToDrive(base64Data, filename, mimeType) {
  const accessToken = await getAccessToken();
  const buffer = Buffer.from(base64Data, "base64");

  const metadata = { name: filename, parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] };
  const boundary = "pitchlab-" + Date.now();
  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ];
  const closing = `\r\n--${boundary}--`;

  const multipartBody = Buffer.concat([
    Buffer.from(bodyParts[0], "utf-8"),
    Buffer.from(bodyParts[1], "utf-8"),
    buffer,
    Buffer.from(closing, "utf-8"),
  ]);

  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": `multipart/related; boundary=${boundary}` },
    body: multipartBody,
  });
  const uploaded = await uploadRes.json();
  if (!uploadRes.ok) throw new Error("Drive upload failed: " + (uploaded.error?.message || uploadRes.status));
  const fileId = uploaded.id;

  // Make it viewable by anyone with the link, so it can be shown directly
  // in the browser without further authentication.
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  const isVideo = mimeType.startsWith("video/");
  // Images/videos both work with the uc?export=view pattern for direct embedding.
  const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
  return { fileId, url: directUrl, isVideo };
}

export async function deleteFromDrive(fileId) {
  const accessToken = await getAccessToken();
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + accessToken },
  });
}
