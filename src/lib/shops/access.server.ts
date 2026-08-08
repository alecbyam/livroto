// ============================================================================
// Contrôle d'accès par boutique — SERVER ONLY. Le propriétaire (shops.owner_id)
// a toujours accès total. Les comptes délégués (shop_staff) ont un accès
// restreint par rôle : 'manager' (menu + commandes), 'staff' (commandes
// uniquement). Jamais d'accès staff/manager aux secrets (shop_integration_settings)
// ni à la gestion d'équipe elle-même — réservé au propriétaire.
// ============================================================================
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ShopAccessRole = "owner" | "manager" | "staff";

/**
 * Vérifie l'accès et renvoie le rôle effectif de l'appelant sur cette boutique.
 * Le propriétaire (shops.owner_id) est TOUJOURS autorisé, quel que soit `allowStaff`
 * — celui-ci ne fait qu'ouvrir l'action aux comptes délégués (manager/staff).
 */
export async function assertShopAccess(
  userId: string,
  shopId: string,
  allowStaff: Array<"manager" | "staff">,
): Promise<ShopAccessRole> {
  const { data: shop } = await supabaseAdmin.from("shops").select("owner_id").eq("id", shopId).maybeSingle();
  if (!shop) throw new Error("Boutique introuvable.");
  if (shop.owner_id === userId) return "owner";
  const { data: staff } = await supabaseAdmin
    .from("shop_staff").select("role").eq("shop_id", shopId).eq("user_id", userId).maybeSingle();
  if (staff && allowStaff.includes(staff.role as "manager" | "staff")) return staff.role as ShopAccessRole;
  throw new Error("Accès refusé : tu n'as pas les droits nécessaires sur cette boutique.");
}

/** Réservé au PROPRIÉTAIRE uniquement (intégrations, gestion d'équipe, réglages sensibles). */
export async function assertShopOwner(userId: string, shopId: string): Promise<void> {
  const { data: shop } = await supabaseAdmin.from("shops").select("owner_id").eq("id", shopId).maybeSingle();
  if (!shop) throw new Error("Boutique introuvable.");
  if (shop.owner_id !== userId) throw new Error("Réservé au propriétaire de la boutique.");
}
