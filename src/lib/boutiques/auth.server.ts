// Garde d'accès staff-boutique centralisée — équivalent de assertAdmin()
// (src/lib/admin.functions.ts) mais scopé à une boutique_id précise et à un
// sous-ensemble de rôles (admin/vendeur/caissier). Passe par la fonction SQL
// is_boutique_staff() (source de vérité unique, déjà utilisée par toutes les
// policies RLS du module) plutôt que de dupliquer la requête en JS.
export type BoutiqueRole = "admin" | "vendeur" | "caissier";

export async function assertBoutiqueStaff(
  ctx: { supabase: any },
  boutiqueId: string,
  roles?: BoutiqueRole[],
) {
  const { data, error } = await ctx.supabase.rpc("is_boutique_staff", {
    p_boutique_id: boutiqueId,
    ...(roles ? { p_roles: roles } : {}),
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès refusé : vous n'êtes pas rattaché à cette boutique avec le rôle requis.");
}
