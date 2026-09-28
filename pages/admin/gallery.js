import { useEffect, useRef, useState } from "react";
import { useProfile } from "../../lib/useProfile";
import { supabase } from "../../lib/supabaseClient";
import Sidebar from "../../components/Sidebar";

// Shrinks a photo in the browser before upload so even large phone/camera
// photos fit comfortably — nobody has to resize anything by hand.
async function compressImage(file) {
  const attempts = [{ dim: 1800, q: 0.85 }, { dim: 1400, q: 0.75 }, { dim: 1000, q: 0.7 }];
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read that image."));
      el.src = url;
    });
    let blob = null;
    for (const { dim, q } of attempts) {
      const scale = Math.min(1, dim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      if (blob && blob.size <= 2.6 * 1024 * 1024) break;
    }
    if (!blob) throw new Error("Couldn't process that image.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AdminGallery() {
  const { loading, me } = useProfile("admin");
  const [images, setImages] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileInputRef = useRef(null);

  const authHeader = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" };
  };

  const loadImages = async () => {
    const res = await fetch("/api/gallery", { headers: await authHeader() });
    const json = await res.json();
    if (res.ok) setImages(json.images || []);
    else setMsg({ type: "err", text: json.error || "Couldn't load the gallery." });
  };

  useEffect(() => { if (!loading && me?.role === "admin") loadImages(); }, [loading, me]);

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const upload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setMsg(null); setBusy(true);
    try {
      const blob = await compressImage(file);
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const baseName = (file.name || "photo").replace(/\.[^.]+$/, "");
      const res = await fetch("/api/gallery", {
        method: "POST", headers: await authHeader(),
        body: JSON.stringify({ base64Data, filename: `${baseName}.jpg`, mimeType: "image/jpeg", caption }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed.");
      setMsg({ type: "ok", text: "✓ Added to the gallery — employees will see it on their dashboard." });
      setFile(null); setCaption("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadImages();
    } catch (err) {
      setMsg({ type: "err", text: err.message || "Upload failed." });
    }
    setBusy(false);
  };

  const remove = async (img) => {
    if (!confirm("Remove this photo from the gallery? Employees will no longer see it.")) return;
    const res = await fetch("/api/gallery", { method: "DELETE", headers: await authHeader(), body: JSON.stringify({ id: img.id }) });
    const json = await res.json();
    if (!res.ok) { setMsg({ type: "err", text: json.error || "Could not remove." }); return; }
    setMsg({ type: "ok", text: "Photo removed." });
    loadImages();
  };

  if (loading) return <div className="center-screen"><div className="mini">Loading…</div></div>;

  if (me?.role !== "admin") {
    return (
      <div className="shell">
        <Sidebar role="admin" me={me} />
        <main className="content"><div className="card pad mini">Only a Super Admin can manage the gallery.</div></main>
      </div>
    );
  }

  return (
    <div className="shell">
      <Sidebar role="admin" me={me} />
      <main className="content">
        <div className="page-hero theme-coral">
          <div className="page-hero-text">
            <h1>Gallery</h1>
            <p>Add photos here — every employee sees them on their dashboard.</p>
          </div>
          <div className="page-hero-glyph">🖼️</div>
        </div>

        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}

        <div className="card pad" style={{ marginBottom: 22, maxWidth: 560 }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>Add a photo</div>
          <form onSubmit={upload}>
            <label className="field">
              <span>Choose an image</span>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            {preview && (
              <img src={preview} alt="Preview" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 12, border: "1px solid var(--line)", marginBottom: 14, display: "block" }} />
            )}
            <label className="field">
              <span>Caption (optional)</span>
              <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Diwali Sales Meet 2026" maxLength={200} />
            </label>
            <button className="btn primary" disabled={!file || busy}>{busy ? "Uploading…" : "Add to gallery"}</button>
          </form>
        </div>

        <div className="section-label">Current gallery ({images.length})</div>
        {images.length === 0 ? (
          <div className="card pad mini">No photos yet — add your first one above.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
            {images.map((img) => (
              <div key={img.id} className="card" style={{ overflow: "hidden" }}>
                <img src={img.url} alt={img.caption || "Gallery photo"} loading="lazy" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }} />
                <div style={{ padding: 12 }}>
                  <div className="mini" style={{ marginBottom: 8, minHeight: 16 }}>{img.caption || "No caption"}</div>
                  <button className="btn danger sm" onClick={() => remove(img)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
