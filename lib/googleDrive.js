// Uploads to a personal Google account's Drive using OAuth refresh-token
// delegation — NOT a service account. Service accounts have zero storage
// quota of their own and can't own files outside a paid Workspace Shared
// Drive, so this instead re-uses a one-time authorization on a real
// Google account (which has real storage) to upload on its behalf.

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!res.ok) {
    throw new Error(
      "Google auth failed (" + res.status + "): " +
      (data.error_description || data.error || text.slice(0, 200) || "no detail returned")
    );
  }
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
