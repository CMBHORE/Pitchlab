import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { uploadToDrive } from "../../lib/googleDrive";

async function requireUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { error: "Not signed in.", status: 401 };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { error: "Session invalid.", status: 401 };
  return { userId: data.user.id };
}

export const config = { api: { bodyParser: { sizeLimit: "15mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET || !process.env.GOOGLE_OAUTH_REFRESH_TOKEN || !process.env.GOOGLE_DRIVE_FOLDER_ID) {
    const missing = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN", "GOOGLE_DRIVE_FOLDER_ID"]
      .filter((k) => !process.env[k]);
    return res.status(500).json({ error: "Google Drive isn't configured — missing: " + missing.join(", ") + ". Check these are set in Vercel for the Production environment specifically." });
  }

  const gate = await requireUser(req);
  if (gate.error) return res.status(gate.status).json({ error: gate.error });

  const { base64Data, filename, mimeType } = req.body || {};
  if (!base64Data || !filename || !mimeType) return res.status(400).json({ error: "Missing file data." });

  try {
    const result = await uploadToDrive(base64Data, filename, mimeType);
    return res.status(200).json({ ok: true, fileId: result.fileId, url: result.url });
  } catch (e) {
    return res.status(500).json({ error: "Upload failed: " + (e.message || e) });
  }
}
