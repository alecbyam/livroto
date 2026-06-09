// ============================================================================
// Helper de configuration des intégrations — SERVER ONLY.
// Lit/écrit la table sécurisée `integration_settings` via service_role.
// Ne JAMAIS importer ce module depuis du code client.
// ============================================================================
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type IntegrationConfig = Record<string, string>;

/** Charge toute la config des intégrations (clé -> valeur). */
export async function loadIntegrationConfig(): Promise<IntegrationConfig> {
  const { data, error } = await supabaseAdmin
    .from("integration_settings")
    .select("key,value");
  if (error) throw new Error(error.message);
  const cfg: IntegrationConfig = {};
  for (const row of data ?? []) cfg[row.key] = row.value ?? "";
  return cfg;
}

/** Écrit un lot de clés. Les secrets vides sont ignorés (pour ne pas écraser une valeur existante). */
export async function saveIntegrationValues(
  entries: { key: string; value: string; isSecret?: boolean }[],
  userId: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  for (const e of entries) {
    // Un secret laissé vide = "ne pas changer" -> on saute.
    if (e.isSecret && e.value.trim() === "") continue;
    const { error } = await supabaseAdmin
      .from("integration_settings")
      .upsert(
        { key: e.key, value: e.value, updated_at: now, updated_by: userId },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
  }
}

/** Lit un flag public on/off (app_settings, lisible anon). */
export async function getPublicFlag(key: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return data?.value === "true";
}

/** Définit un flag public on/off. */
export async function setPublicFlag(key: string, value: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("app_settings")
    .upsert({ key, value: value ? "true" : "false" }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

/** Masque un secret pour l'affichage admin : ne révèle jamais la valeur complète. */
export function maskSecret(v?: string | null): string | null {
  if (!v || v.trim() === "") return null;
  const s = v.trim();
  if (s.length <= 4) return "••••";
  return "••••••" + s.slice(-4);
}

/** Taux USD->CDF courant (pour convertir un montant à débiter via mobile money). */
export async function getCdfRate(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "cdf_rate")
    .maybeSingle();
  const r = Number(data?.value);
  return Number.isFinite(r) && r > 0 ? r : 2800;
}
