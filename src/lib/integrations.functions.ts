// ============================================================================
// Server functions des intégrations : configuration admin (FlexPay + WhatsApp)
// et paiement client FlexPay (initiation + polling de statut).
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  loadIntegrationConfig, saveIntegrationValues, setPublicFlag, getPublicFlag,
  maskSecret, getCdfRate,
} from "@/lib/integrations/config.server";
import {
  getFlexpayConfig, flexpayInitiateMobileMoney, flexpayCheck, flexpayPing,
} from "@/lib/integrations/flexpay.server";
import { getWhatsappConfig, whatsappPing } from "@/lib/integrations/whatsapp.server";
import { phoneDigits } from "@/lib/phone";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Forbidden: admin only");
}

const SECRET_KEYS = new Set(["flexpay_token", "whatsapp_token", "whatsapp_app_secret"]);
const FLEXPAY_KEYS = ["flexpay_base_url", "flexpay_merchant", "flexpay_token", "flexpay_currency", "flexpay_callback_url"];
const WHATSAPP_KEYS = ["whatsapp_base_url", "whatsapp_phone_number_id", "whatsapp_token", "whatsapp_business_id", "whatsapp_verify_token", "whatsapp_app_secret", "whatsapp_lang"];

function supabaseFunctionsBase(): string {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  return url ? `${url}/functions/v1` : "";
}

// ---------- ADMIN : lecture de l'état (secrets masqués) ----------
export const adminGetIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const c = await loadIntegrationConfig();
    const [flexpayEnabled, whatsappEnabled] = await Promise.all([
      getPublicFlag("flexpay_enabled"),
      getPublicFlag("whatsapp_enabled"),
    ]);
    const fnBase = supabaseFunctionsBase();
    return {
      flexpay: {
        enabled: flexpayEnabled,
        base_url: c.flexpay_base_url ?? "",
        merchant: c.flexpay_merchant ?? "",
        currency: c.flexpay_currency ?? "CDF",
        callback_url: c.flexpay_callback_url ?? "",
        token_set: !!c.flexpay_token,
        token_masked: maskSecret(c.flexpay_token),
        configured: !!(c.flexpay_merchant && c.flexpay_token),
        suggested_callback_url: fnBase ? `${fnBase}/flexpay-callback` : "",
      },
      whatsapp: {
        enabled: whatsappEnabled,
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
        suggested_webhook_url: fnBase ? `${fnBase}/whatsapp-webhook` : "",
      },
    };
  });

// ---------- ADMIN : enregistrement ----------
export const adminSaveIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      section: z.enum(["flexpay", "whatsapp"]),
      enabled: z.boolean().optional(),
      values: z.record(z.string(), z.string()).default({}),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const allowed = data.section === "flexpay" ? FLEXPAY_KEYS : WHATSAPP_KEYS;
    const entries = Object.entries(data.values)
      .filter(([k]) => allowed.includes(k))
      .map(([key, value]) => ({ key, value, isSecret: SECRET_KEYS.has(key) }));
    await saveIntegrationValues(entries, context.userId);

    if (typeof data.enabled === "boolean") {
      // On n'active que si la config minimale est présente.
      const c = await loadIntegrationConfig();
      const configured = data.section === "flexpay"
        ? !!(c.flexpay_merchant && c.flexpay_token)
        : !!(c.whatsapp_phone_number_id && c.whatsapp_token);
      if (data.enabled && !configured) {
        throw new Error("Impossible d'activer : renseigne d'abord les identifiants requis.");
      }
      await setPublicFlag(`${data.section}_enabled`, data.enabled);
    }
    return { ok: true };
  });

// ---------- ADMIN : tests de connexion ----------
export const adminTestFlexpay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const cfg = await getFlexpayConfig();
    if (!cfg) return { ok: false, detail: "FlexPay non configuré (merchant + token requis)." };
    return await flexpayPing(cfg);
  });

export const adminTestWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const cfg = await getWhatsappConfig();
    if (!cfg) return { ok: false, detail: "WhatsApp non configuré (phone_number_id + token requis)." };
    return await whatsappPing(cfg);
  });

// ---------- CLIENT : initiation paiement FlexPay ----------
export const flexpayInitiate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      order_id: z.string().uuid(),
      phone: z.string().min(8).max(20),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    if (!(await getPublicFlag("flexpay_enabled"))) {
      return { ok: false as const, error: "Le paiement FlexPay n'est pas activé." };
    }
    const cfg = await getFlexpayConfig();
    if (!cfg) return { ok: false as const, error: "FlexPay non configuré." };

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,code,customer_id,total_usd,payment_method,payment_status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order || order.customer_id !== userId) {
      return { ok: false as const, error: "Commande introuvable." };
    }
    if (order.payment_status === "paid") {
      return { ok: false as const, error: "Cette commande est déjà payée." };
    }

    // Montant à débiter dans la devise configurée (CDF arrondi, ou USD).
    const usd = Number(order.total_usd ?? 0);
    let amount = usd;
    if (cfg.currency === "CDF") {
      const rate = await getCdfRate();
      amount = Math.max(1, Math.round(usd * rate));
    }
    const reference = `LVR-${order.code ?? order.id.slice(0, 8)}-${Date.now().toString().slice(-6)}`;

    const result = await flexpayInitiateMobileMoney({
      cfg,
      phone: data.phone,
      amount,
      reference,
      currency: cfg.currency,
    });
    if (!result.ok) {
      return { ok: false as const, error: result.error || "Échec de l'initiation du paiement." };
    }

    // Trace une ligne de paiement "pending" rattachée à la passerelle.
    await supabaseAdmin.from("payments").insert({
      order_id: order.id,
      method: order.payment_method,
      status: "pending",
      amount_usd: usd,
      provider: "flexpay",
      provider_ref: result.orderNumber,
      provider_status: "pending",
      phone: phoneDigits(data.phone),
      currency: cfg.currency,
      raw: result.raw,
    });

    return { ok: true as const, orderNumber: result.orderNumber, amount, currency: cfg.currency };
  });

// ---------- CLIENT : vérification du statut (polling) ----------
export const flexpayCheckStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const cfg = await getFlexpayConfig();
    if (!cfg) return { ok: false as const, status: "pending" as const, error: "FlexPay non configuré." };

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,customer_id,payment_status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order || order.customer_id !== userId) {
      return { ok: false as const, status: "pending" as const, error: "Commande introuvable." };
    }
    if (order.payment_status === "paid") {
      return { ok: true as const, status: "success" as const };
    }

    const { data: pay } = await supabaseAdmin
      .from("payments")
      .select("id,provider_ref")
      .eq("order_id", order.id)
      .eq("provider", "flexpay")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!pay?.provider_ref) {
      return { ok: false as const, status: "pending" as const, error: "Aucun paiement FlexPay en cours." };
    }

    const { status, raw } = await flexpayCheck(pay.provider_ref, cfg);

    if (status === "success") {
      await supabaseAdmin.from("payments")
        .update({ status: "paid", provider_status: "success", collected_at: new Date().toISOString(), raw })
        .eq("id", pay.id);
      await supabaseAdmin.from("orders").update({ payment_status: "paid" }).eq("id", order.id);
    } else if (status === "failed") {
      await supabaseAdmin.from("payments")
        .update({ status: "failed", provider_status: "failed", raw })
        .eq("id", pay.id);
      await supabaseAdmin.from("orders").update({ payment_status: "failed" }).eq("id", order.id);
    }

    return { ok: true as const, status };
  });
