import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- Profile + roles overview (partagé par tous les rôles) ----------
export const getMyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Requêtes essentielles via le client de l'utilisateur (RLS)
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    // Requêtes admin via service_role (optionnelles — ne bloquent pas si la clé manque)
    let vendorData = null;
    let riderData = null;
    try {
      const [vendorRes, riderRes] = await Promise.all([
        supabaseAdmin.from("vendors").select("*").eq("owner_id", userId).maybeSingle(),
        supabaseAdmin.from("riders").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      vendorData = vendorRes.data;
      riderData = riderRes.data;
    } catch (e) {
      console.error("[getMyOverview] supabaseAdmin unavailable:", e);
    }

    return {
      profile: profileRes.data,
      roles: (rolesRes.data ?? []).map((r) => r.role as string),
      vendor: vendorData,
      rider: riderData,
    };
  });

// ---------- Zones (lecture publique ; gestion admin dans admin.functions.ts) ----------
export const getZones = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin.from("zones").select("*").eq("active", true).order("name");
  return { zones: data ?? [] };
});

// Server functions par domaine — voir chaque fichier pour le détail.
// Réexportées ici pour ne pas casser les imports existants depuis "@/lib/dashboard.functions".
export * from "@/lib/vendor.functions";
export * from "@/lib/rider.functions";
export * from "@/lib/admin.functions";
export * from "@/lib/customer-orders.functions";
