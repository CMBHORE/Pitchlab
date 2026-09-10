import { supabaseAdmin } from "../../lib/supabaseAdmin";

async function requireSuperAdmin(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { error: "Not signed in.", status: 401 };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { error: "Session invalid.", status: 401 };
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", data.user.id).single();
  // Only a true Super Admin can create or manage other admin accounts —
  // a scoped trainer/admin can never grant themselves or anyone else
  // broader access than they have.
  if (profile?.role !== "admin") return { error: "Only a Super Admin can manage admin accounts.", status: 403 };
  return { ok: true };
}

export default async function handler(req, res) {
  const gate = await requireSuperAdmin(req);
  if (gate.error) return res.status(gate.status).json({ error: gate.error });

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("profiles").select("id, full_name, email, role, permissions, assigned_teams")
      .in("role", ["admin", "trainer"])
      .order("full_name", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ admins: data });
  }

  if (req.method === "POST") {
    const { full_name, email, password, permissions, assigned_teams } = req.body || {};
    if (!full_name || !email || !password) return res.status(400).json({ error: "Missing required fields." });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createErr) return res.status(400).json({ error: createErr.message });

    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: created.user.id, full_name, email, role: "trainer",
      permissions: permissions || {}, assigned_teams: assigned_teams || [],
    });
    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({ error: profileErr.message });
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === "PATCH") {
    const { id, permissions, assigned_teams } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing id." });
    const { error } = await supabaseAdmin.from("profiles").update({
      permissions: permissions || {}, assigned_teams: assigned_teams || [],
    }).eq("id", id).eq("role", "trainer"); // can only edit scoped admins this way, never a true Super Admin
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing id." });
    const { data: target } = await supabaseAdmin.from("profiles").select("role").eq("id", id).single();
    if (target?.role === "admin") return res.status(403).json({ error: "Cannot remove a Super Admin account here." });
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) return res.status(500).json({ error: error.message });
    await supabaseAdmin.from("profiles").delete().eq("id", id);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed." });
}
