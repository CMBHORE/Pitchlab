import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabaseClient";
import Sidebar from "../components/Sidebar";

export default function MyProfile() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      setMe(profile);
      setLoading(false);
    })();
  }, [router]);

  const changePassword = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (newPassword.length < 6) { setMsg({ type: "err", text: "Password must be at least 6 characters." }); return; }
    if (newPassword !== confirmPassword) { setMsg({ type: "err", text: "Passwords don't match." }); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) { setMsg({ type: "err", text: error.message }); return; }
    setMsg({ type: "ok", text: "✓ Password updated. Use your new password next time you log in." });
    setNewPassword(""); setConfirmPassword("");
  };

  if (loading || !me) return <div className="center-screen"><div className="mini">Loading…</div></div>;

  const sidebarRole = me.role === "admin" || me.role === "trainer" ? "admin" : "employee";

  return (
    <div className="shell">
      <Sidebar role={sidebarRole} me={me} />
      <main className="content">
        <div className="page-hero theme-violet">
          <div className="page-hero-text">
            <h1>My Profile</h1>
            <p>Your account details and login.</p>
          </div>
          <div className="page-hero-glyph">⚙️</div>
        </div>

        <div className="card pad" style={{ marginBottom: 22, maxWidth: 480 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 8 }}>
            <div className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>
              {(me.full_name || "?").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{me.full_name}</div>
              <div className="mini">{me.email}</div>
              <div className="mini" style={{ textTransform: "capitalize" }}>{me.role === "trainer" ? "Scoped Admin" : me.role}</div>
            </div>
          </div>
        </div>

        <div className="card pad" style={{ maxWidth: 480 }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>Change password</div>
          {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
          <form onSubmit={changePassword}>
            <label className="field"><span>New password</span>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="min 6 characters" required minLength={6} /></label>
            <label className="field"><span>Confirm new password</span>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="repeat password" required minLength={6} /></label>
            <button className="btn primary" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
          </form>
        </div>
      </main>
    </div>
  );
}
