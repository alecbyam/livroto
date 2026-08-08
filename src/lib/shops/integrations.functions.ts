// ============================================================================
// Intégrations FlexPay + WhatsApp Business PAR BOUTIQUE — server functions
// exposées au panneau owner (et à l'admin plateforme). Miroir exact de
// integrations.functions.ts (config globale), juste scoping shop_id en plus.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadShopIntegrationConfig, saveShopIntegrationValues } from "@/lib/integrations/shop-config.server";
import { maskSecret } from "@/lib/integrations/config.server";
import { getFlexpayConfig, flexpayPing } from "@/lib/integrations/flexpay.server";
import { getWhatsappConfig, whatsappPing } from "@/lib/integrations/whatsapp.server";

const SECRET_KEYS = new Set(["flexpay_token", "whatsapp_token", "whatsapp_app_secret"]);
const FLEXPAY_KEYS = ["flexpay_base_url", "flexpay_merchant", "flexpay_token", "flexpay_currency", "flexpay_callback_url"];
const WHATSAPP_KEYS = ["whatsapp_base_url", "whatsapp_phone_number_id", "whatsapp_token", "whatsapp_business_id", "whatsapp_verify_token", "whatsapp_app_secret", "whatsapp_lang"];

async function assertOwnerOrAdmin(supabase: any, userId: string, shopId: string) {
  const { data: shop } = await supabase.from("shops").select("id,owner_id").eq("id", shopId).maybeSingle();
  if (shop?.owner_id === userId) return;
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if ((roles ?? []).some((r: any) => r.role === "admin")) return;
  throw new Error("Forbidden: propriétaire de la boutique ou admin uniquement");
}

export const ownerGetShopIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ shop_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context.supabase, context.userId, data.shop_id);
    const c = await loadShopIntegrationConfig(data.shop_id);
    return {
      flexpay: {
        base_url: c.flexpay_base_url ?? "",
        merchant: c.flexpay_merchant ?? "",
        currency: c.flexpay_currency ?? "USD",
        callback_url: c.flexpay_callback_url ?? "",
        token_set: !!c.flexpay_token,
        token_masked: maskSecret(c.flexpay_token),
        configured: !!(c.flexpay_merchant && c.flexpay_token),
      },
      whatsapp: {
        base_url: c.whatsapp_base_url ?? "",
        phone_number_id: c.whatsapp_phone_number_id ?? "",
        business_id: c.whatsapp_business_id ?? "",
        verify_token: c.whatsapp_verify_token ?? "",
        lang: c.whatsapp_lang ?? "fr",
        token_set: !!c.whatsapp_token,
        token_masked: maskSecret(c.whatsapp_token),
        app_secret_set: !!c.whatsapp_app_secret,
        app_secret_masked: maskSecret(c.whatsapp_app_secret),
        configured: !!(c.whatsapp_phone_number_id && c.whatsapp_token),
      },
    };
  });

export const ownerSaveShopIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      shop_id: z.string().uuid(),
      section: z.enum(["flexpay", "whatsapp"]),
      values: z.record(z.string(), z.string()).default({}),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context.supabase, context.userId, data.shop_id);
    const allowed = data.section === "flexpay" ? FLEXPAY_KEYS : WHATSAPP_KEYS;
    const entries = Object.entries(data.values)
      .filter(([k]) => allowed.includes(k))
      .map(([key, value]) => ({ key, value, isSecret: SECRET_KEYS.has(key) }));
    await saveShopIntegrationValues(data.shop_id, entries, context.userId);
    return { ok: true };
  });

export const ownerTestShopFlexpay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ shop_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context.supabase, context.userId, data.shop_id);
    const cfg = await getFlexpayConfig(await loadShopIntegrationConfig(data.shop_id));
    if (!cfg) return { ok: false, detail: "FlexPay non configuré (merchant + token requis)." };
    return await flexpayPing(cfg);
  });

export const ownerTestShopWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ shop_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertOwnerOrAdmin(context.supabase, context.userId, data.shop_id);
    const cfg = await getWhatsappConfig(await loadShopIntegrationConfig(data.shop_id));
    if (!cfg) return { ok: false, detail: "WhatsApp non configuré (phone_number_id + token requis)." };
    return await whatsappPing(cfg);
  });
