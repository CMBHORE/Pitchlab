import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Drop <Gallery /> on any page. It loads the images the admin uploaded
// and shows them as a grid; clicking one opens it full-size. If there
// are no images yet, it shows nothing at all.
export default function Gallery({ title = "📸 Gallery" }) {
  const [images, setImages] = useState(null); // null = still loading
  const [active, setActive] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/gallery", { headers: { Authorization: `Bearer ${session?.access_token}` } });
        const json = await res.json();
        if (alive) setImages(res.ok ? (json.images || []) : []);
      } catch {
        if (alive) setImages([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e) => { if (e.key === "Escape") setActive(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (!images || images.length === 0) return null;

  return (
    <div className="card pad" style={{ marginBottom: 22 }}>
      <div className="card-head">
        <div style={{ fontWeight: 700 }}>{title}</div>
        <span className="mini">{images.length} photo{images.length === 1 ? "" : "s"}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14 }}>
        {images.map((img) => (
          <div
            key={img.id}
            onClick={() => setActive(img)}
            style={{ position: "relative", borderRadius: 16, overflow: "hidden", cursor: "pointer", aspectRatio: "4 / 3", background: "var(--card-2)", border: "1px solid var(--line)" }}
          >
            <img
              src={img.url} alt={img.caption || "Gallery photo"} loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", transition: "transform .3s ease" }}
              onMouseOver={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            />
            {img.caption && (
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "24px 12px 10px", color: "#fff", fontSize: 12.5, fontWeight: 600, background: "linear-gradient(to top, rgba(20,22,43,.75), transparent)" }}>
                {img.caption}
              </div>
            )}
          </div>
        ))}
      </div>

      {active && (
        <div
          onClick={() => setActive(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(17,22,26,.85)", display: "grid", placeItems: "center", padding: 24, zIndex: 100 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "92vw", textAlign: "center" }}>
            <img src={active.url} alt={active.caption || "Gallery photo"} style={{ maxWidth: "92vw", maxHeight: "80vh", borderRadius: 14, display: "block", margin: "0 auto" }} />
            {active.caption && <div style={{ color: "#fff", marginTop: 12, fontSize: 15, fontWeight: 600 }}>{active.caption}</div>}
            <button className="btn outline" style={{ marginTop: 14 }} onClick={() => setActive(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
