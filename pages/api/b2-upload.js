import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { uploadToB2 } from "../../lib/b2Upload";

async function requireUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { error: "Not signed in.", status: 401 };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { error: "Session invalid.", status: 401 };
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });

  if (!process.env.B2_ENDPOINT || !process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY || !process.env.B2_BUCKET_NAME || !process.env.B2_PUBLIC_URL) {
    const missing = ["B2_ENDPOINT", "B2_KEY_ID", "B2_APPLICATION_KEY", "B2_BUCKET_NAME", "B2_PUBLIC_URL"].filter((k) => !process.env[k]);
    return res.status(500).json({ error: "Backblaze B2 isn't configured — missing: " + missing.join(", ") });
  }

  const gate = await requireUser(req);
  if (gate.error) return res.status(gate.status).json({ error: gate.error });

  const { base64Data, filename, mimeType } = req.body || {};
  if (!base64Data || !filename) return res.status(400).json({ error: "Missing file data." });

  try {
    const { url } = await uploadToB2(base64Data, filename, mimeType);
    return res.status(200).json({ url });
  } catch (e) {
    return res.status(500).json({ error: "Upload failed: " + (e.message || e) });
  }
}
