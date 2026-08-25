import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";
import {
  loadBoutiqueIntegrationConfig,
  saveBoutiqueIntegrationValues,
} from "@/lib/boutiques/integration-config.server";
import { whatsappPing, getWhatsappConfig } from "@/lib/integrations/whatsapp.server";
import { flexpayPing, getFlexpayConfig } from "@/lib/integrations/flexpay.server";

// Ne renvoie JAMAIS les secrets en clair au client — seulement s'ils sont
// configurés ou non (même principe que la config globale JuntoxShop).
export const boutiqueObtenirParametresIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const cfg = await loadBoutiqueIntegrationConfig(data.boutique_id);
    return {
      whatsapp_phone_number_id: cfg.whatsapp_phone_number_id ?? "",
      whatsapp_configure: Boolean(cfg.whatsapp_token),
      flexpay_merchant: cfg.flexpay_merchant ?? "",
      flexpay_configure: Boolean(cfg.flexpay_token),
      hm_logistics_api_key_configure: Boolean(cfg.hm_logistics_api_key),
    };
  });

export const boutiqueEnregistrerWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        whatsapp_phone_number_id: z.string().max(60),
        whatsapp_token: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    await saveBoutiqueIntegrationValues(data.boutique_id, [
      { key: "whatsapp_phone_number_id", value: data.whatsapp_phone_number_id },
      { key: "whatsapp_token", value: data.whatsapp_token ?? "", isSecret: true },
      { key: "whatsapp_base_url", value: "https://graph.facebook.com/v21.0" },
      { key: "whatsapp_lang", value: "fr" },
    ]);
    return { ok: true };
  });

export const boutiqueTesterWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const cfg = await getWhatsappConfig(await loadBoutiqueIntegrationConfig(data.boutique_id));
    if (!cfg) return { ok: false, detail: "Numéro/token non configurés." };
    return whatsappPing(cfg);
  });

// FlexPay (paiement Mobile Money — M-Pesa/Orange/Airtel) propre à la
// boutique : mêmes clés (flexpay_merchant/flexpay_token) et mêmes fonctions
// bas niveau que la config globale JuntoxShop (src/lib/integrations/flexpay.server.ts),
// mais chargées depuis boutique_integration_settings — jamais partagées entre
// boutiques ni avec le compte FlexPay JuntoxShop.
export const boutiqueEnregistrerFlexpay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        flexpay_merchant: z.string().max(120),
        flexpay_token: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    await saveBoutiqueIntegrationValues(data.boutique_id, [
      { key: "flexpay_merchant", value: data.flexpay_merchant },
      { key: "flexpay_token", value: data.flexpay_token ?? "", isSecret: true },
    ]);
    return { ok: true };
  });

export const boutiqueTesterFlexpay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const cfg = await getFlexpayConfig(await loadBoutiqueIntegrationConfig(data.boutique_id));
    if (!cfg) return { ok: false, detail: "Marchand/token non configurés." };
    return flexpayPing(cfg);
  });

// Coordonnées + réseaux sociaux vivent directement sur `boutiques` (pas dans
// boutique_integration_settings, ce ne sont pas des secrets — déjà lisibles
// publiquement via boutiques_public_read). Mais la seule policy d'écriture
// sur cette table est réservée à l'admin PLATEFORME (migration 31, pour
// protéger domaine/slug) : on passe donc par supabaseAdmin comme pour la
// config d'intégration, avec un allowlist strict de colonnes qui exclut
// explicitement domaine/slug — jamais exposées ici ni ailleurs dans ce module.
export const boutiqueEnregistrerCoordonnees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        adresse: z.string().max(300),
        telephone: z.string().max(30),
        email: z.union([z.string().email(), z.literal("")]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const { error } = await supabaseAdmin
      .from("boutiques")
      .update({
        adresse: data.adresse || null,
        telephone: data.telephone || null,
        email: data.email || null,
      })
      .eq("id", data.boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const boutiqueEnregistrerReseauxSociaux = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        facebook_url: z.string().max(300),
        tiktok_url: z.string().max(300),
        whatsapp_url: z.string().max(300),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const { error } = await supabaseAdmin
      .from("boutiques")
      .update({
        facebook_url: data.facebook_url || null,
        tiktok_url: data.tiktok_url || null,
        whatsapp_url: data.whatsapp_url || null,
      })
      .eq("id", data.boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
