// ============================================================================
// Helper de configuration des intégrations PAR BOUTIQUE — SERVER ONLY.
// Lit/écrit la table sécurisée `shop_integration_settings` via service_role.
// Miroir exact de config.server.ts (config globale) et du pattern déjà en
// prod sur `boutique_integration_settings` (Hugo Collection) — même contrat :
// RLS activé sans policy, accès uniquement via supabaseAdmin.
// Ne JAMAIS importer ce module depuis du code client.
// ============================================================================
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ShopIntegrationConfig = Record<string, string>;

/** Charge toute la config des intégrations d'une boutique (clé -> valeur). */
export async function loadShopIntegrationConfig(shopId: string): Promise<ShopIntegrationConfig> {
  const { data, error } = await supabaseAdmin
    .from("shop_integration_settings")
    .select("key,value")
    .eq("shop_id", shopId);
  if (error) throw new Error(error.message);
  const cfg: ShopIntegrationConfig = {};
  for (const row of data ?? []) cfg[row.key] = row.value ?? "";
  return cfg;
}

/** Écrit un lot de clés pour une boutique. Un secret laissé vide = "ne pas changer". */
export async function saveShopIntegrationValues(
  shopId: string,
  entries: { key: string; value: string; isSecret?: boolean }[],
  userId: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  for (const e of entries) {
    if (e.isSecret && e.value.trim() === "") continue;
    const { error } = await supabaseAdmin
      .from("shop_integration_settings")
      .upsert(
        { shop_id: shopId, key: e.key, value: e.value, is_secret: !!e.isSecret, updated_at: now, updated_by: userId },
        { onConflict: "shop_id,key" },
      );
    if (error) throw new Error(error.message);
  }
}
