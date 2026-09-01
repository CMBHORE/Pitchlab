import { supabaseAdmin } from "../../lib/supabaseAdmin";

async function requireUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { error: "Not signed in.", status: 401 };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { error: "Session invalid.", status: 401 };
  return { userId: data.user.id };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  const gate = await requireUser(req);
  if (gate.error) return res.status(gate.status).json({ error: gate.error });

  const { resultId, recordingUrl } = req.body || {};
  if (!resultId || !recordingUrl) return res.status(400).json({ error: "Missing resultId or recordingUrl." });

  // Only ever attach a recording to a call that actually belongs to this employee.
  const { data: result } = await supabaseAdmin.from("roleplay_results").select("user_id").eq("id", resultId).single();
  if (!result || result.user_id !== gate.userId) return res.status(403).json({ error: "That call doesn't belong to you." });

  // recording_path now holds a direct Google Drive link — no signed-URL
  // step needed, unlike the old Supabase Storage version.
  const { error } = await supabaseAdmin.from("roleplay_results").update({ recording_path: recordingUrl }).eq("id", resultId);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true, recording_url: recordingUrl });
}
