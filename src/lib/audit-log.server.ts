// Journal d'audit admin — qui a fait quoi, sur quelle cible, quand (voir migration 62).
// Gap identifié à l'audit du 5/08/2026 : jusqu'ici, une action admin (approuver un vendeur,
// changer un rôle, couper une promo, résoudre un signalement...) ne laissait aucune trace de
// QUI l'a faite. Best-effort volontaire : un échec d'écriture du journal ne doit JAMAIS faire
// échouer l'action admin elle-même (même philosophie que error-reporting.functions.ts).
export async function logAdminAction(entry: {
  adminId: string;
  action: string; // ex: "vendor_status_change", "role_grant" — voir les appels dans admin.functions.ts
  targetType?: string | null; // ex: "vendor", "user", "zone"
  targetId?: string | null;
  details?: Record<string, unknown> | null;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_actions").insert({
      admin_id: entry.adminId,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      details: (entry.details as any) ?? null,
    });
  } catch (e) {
    console.error("[admin_actions] échec d'enregistrement (non bloquant) :", e);
  }
}
