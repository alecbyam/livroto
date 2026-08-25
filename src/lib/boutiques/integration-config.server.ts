// Config/secrets d'intégration PAR boutique (WhatsApp Business, HM Logistics).
// Même principe que src/lib/integrations/config.server.ts (config globale
// JuntoxShop) mais scopé à boutique_integration_settings (migration 31) : chaque
// boutique cliente a ses propres identifiants, jamais partagés entre elles.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BoutiqueIntegrationConfig = Record<string, string>;

export async function loadBoutiqueIntegrationConfig(boutiqueId: string): Promise<BoutiqueIntegrationConfig> {
  const { data, error } = await supabaseAdmin
    .from("boutique_integration_settings")
    .select("key,value")
    .eq("boutique_id", boutiqueId);
  if (error) throw new Error(error.message);
  const cfg: BoutiqueIntegrationConfig = {};
  for (const row of data ?? []) cfg[row.key] = row.value ?? "";
  return cfg;
}

export async function saveBoutiqueIntegrationValues(
  boutiqueId: string,
  entries: { key: string; value: string; isSecret?: boolean }[],
): Promise<void> {
  const now = new Date().toISOString();
  for (const e of entries) {
    // Un secret laissé vide = "ne pas changer" -> on saute (même règle que la config globale).
    if (e.isSecret && e.value.trim() === "") continue;
    const { error } = await supabaseAdmin
      .from("boutique_integration_settings")
      .upsert(
        { boutique_id: boutiqueId, key: e.key, value: e.value, is_secret: e.isSecret ?? false, updated_at: now },
        { onConflict: "boutique_id,key" },
      );
    if (error) throw new Error(error.message);
  }
}
