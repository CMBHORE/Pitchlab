import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "./supabaseClient";

// Guards a page. Pass requireRole "admin" or "employee".
// A scoped "trainer" account is allowed anywhere an "admin" is required —
// individual pages are responsible for respecting that trainer's specific
// permissions and assigned teams once they're in.
// Returns { loading, me }. Redirects to /login if not signed in,
// or to the correct home if the role doesn't match.
export function useProfile(requireRole) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (!active) return;

      if (!profile) {
        // Logged in but no profile row yet
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      const allowed = requireRole === "admin"
        ? (profile.role === "admin" || profile.role === "trainer")
        : profile.role === requireRole;

      if (requireRole && !allowed) {
        router.replace(profile.role === "admin" || profile.role === "trainer" ? "/admin" : "/employee");
        return;
      }
      setMe(profile);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [requireRole, router]);

  return { loading, me };
}
