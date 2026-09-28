import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { uploadToB2, getFreshB2Url, deleteFromB2 } from "../../lib/b2Upload";

// Room for a compressed photo sent as base64 (Vercel itself caps requests at ~4.5MB).
export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

async function getCaller(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { error: "Not signed in.", status: 401 };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { error: "Session invalid.", status: 401 };
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", data.user.id).single();
  return { userId: data.user.id, role: profile?.role };
}

export default async function handler(req, res) {
  const caller = await getCaller(req);
  if (caller.error) return res.status(caller.status).json({ error: caller.error });

  const missing = ["B2_ENDPOINT", "B2_KEY_ID", "B2_APPLICATION_KEY", "B2_BUCKET_NAME"].filter((k) => !process.env[k]);
  if (missing.length) return res.status(500).json({ error: "Backblaze B2 isn't configured — missing: " + missing.join(", ") });

  // Anyone signed in (employees included) can VIEW the gallery.
  // A fresh secure link is generated on every load, so images never expire.
  if (req.method === "GET") {
    const { data: rows, error } = await supabaseAdmin
      .from("gallery_images").select("id, caption, storage_key, created_at")
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const images = (await Promise.all((rows || []).map(async (r) => {
      try {
        return { id: r.id, caption: r.caption || "", created_at: r.created_at, url: await getFreshB2Url(r.storage_key) };
      } catch { return null; }
    }))).filter(Boolean);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ images });
  }

  // Only the Super Admin can add or remove gallery images.
  if (caller.role !== "admin") return res.status(403).json({ error: "Only a Super Admin can change the gallery." });

  if (req.method === "POST") {
    const { base64Data, filename, mimeType, caption } = req.body || {};
    if (!base64Data || !filename) return res.status(400).json({ error: "Missing image data." });
    if (!String(mimeType || "").startsWith("image/")) return res.status(400).json({ error: "Only image files can be added to the gallery." });

    let uploaded;
    try {
      uploaded = await uploadToB2(base64Data, "gallery-" + String(filename).replace(/[^\w.\-]+/g, "_"), mimeType);
    } catch (e) {
      return res.status(500).json({ error: "Upload failed: " + (e.message || e) });
    }

    const { error } = await supabaseAdmin.from("gallery_images").insert({
      caption: String(caption || "").slice(0, 200) || null,
      storage_key: uploaded.key,
      created_by: caller.userId,
    });
    if (error) {
      try { await deleteFromB2(uploaded.key); } catch {}
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing image id." });
    const { data: row } = await supabaseAdmin.from("gallery_images").select("storage_key").eq("id", id).single();
    if (row?.storage_key) { try { await deleteFromB2(row.storage_key); } catch {} }
    const { error } = await supabaseAdmin.from("gallery_images").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed." });
}
