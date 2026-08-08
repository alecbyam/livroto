// ============================================================================
// Commandes boutique générique : checkout, paiement FlexPay (par boutique),
// suivi client, back-office propriétaire. Miroir de checkout.functions.ts /
// integrations.functions.ts côté marketplace natif, adapté au schéma shop_*.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadShopIntegrationConfig } from "@/lib/integrations/shop-config.server";
import { getFlexpayConfig, flexpayInitiateMobileMoney, flexpayCheck } from "@/lib/integrations/flexpay.server";
import { getCdfRate } from "@/lib/integrations/config.server";
import { phoneDigits } from "@/lib/phone";
import { notifyShopCustomerOrderCreated, notifyShopCustomerStatusChanged } from "@/lib/shops/notifications.server";
import { assertShopAccess } from "@/lib/shops/access.server";

const PAYMENT_METHODS = ["cash", "mpesa", "airtel_money", "orange_money"] as const;
const ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready", "picked_up", "delivered", "cancelled"] as const;

// ---------- CLIENT : passer commande ----------
const checkoutInput = z.object({
  shop_id: z.string().uuid(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.number().int().min(1).max(50),
    notes: z.string().max(200).optional(),
  })).min(1).max(50),
  zone_id: z.string().uuid().nullable(),
  customer_name: z.string().trim().min(1).max(120),
  customer_phone: z.string().trim().min(3).max(40),
  customer_address: z.string().trim().min(1).max(500),
  payment_method: z.enum(PAYMENT_METHODS),
  customer_notes: z.string().trim().max(500).nullable(),
});

export const createShopOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => checkoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: shop } = await supabaseAdmin
      .from("shops").select("id,name,status,currency").eq("id", data.shop_id).maybeSingle();
    if (!shop || shop.status !== "approved") throw new Error("Boutique introuvable ou fermée.");

    // Paiement mobile money : impossible sans que la boutique ait configuré SON PROPRE
    // FlexPay — jamais de repli silencieux sur un compte marchand partagé (ce serait de
    // l'argent d'un client encaissé sur le compte d'une autre boutique).
    if (data.payment_method !== "cash") {
      const cfg = await getFlexpayConfig(await loadShopIntegrationConfig(data.shop_id));
      if (!cfg) throw new Error("Le paiement mobile money n'est pas encore configuré pour cette boutique. Choisis « Cash à la livraison ».");
    }

    const productIds = [...new Set(data.items.map((i) => i.product_id))];
    const { data: products, error: prodErr } = await supabaseAdmin
      .from("shop_products")
      .select("id,shop_id,name,price_usd,is_available")
      .in("id", productIds);
    if (prodErr) throw new Error(prodErr.message);
    const byId = new Map((products ?? []).map((p) => [p.id, p]));
    for (const it of data.items) {
      const p = byId.get(it.product_id);
      if (!p || p.shop_id !== data.shop_id) throw new Error("Un article du panier n'appartient pas à cette boutique.");
      if (!p.is_available) throw new Error(`« ${p.name} » n'est plus disponible actuellement.`);
    }

    let zoneName = "";
    if (data.zone_id) {
      const { data: zone } = await supabaseAdmin.from("zones").select("name").eq("id", data.zone_id).eq("active", true).maybeSingle();
      zoneName = zone?.name ?? "";
    }

    const lines = data.items.map((it) => {
      const p = byId.get(it.product_id)!;
      const unitPrice = Number(p.price_usd);
      return { productId: p.id, name: p.name, qty: it.quantity, unitPrice, lineTotal: unitPrice * it.quantity, notes: it.notes ?? null };
    });
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const deliveryFee = 0; // le livreur/la boutique communique le tarif réel après validation (même principe que le marketplace natif)

    const { data: order, error: oErr } = await supabaseAdmin
      .from("shop_orders")
      .insert({
        shop_id: data.shop_id,
        customer_id: userId,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_address: data.customer_address,
        zone_id: data.zone_id,
        zone_name: zoneName,
        subtotal_usd: subtotal,
        delivery_fee: deliveryFee,
        total_usd: subtotal + deliveryFee,
        payment_method: data.payment_method,
        customer_notes: data.customer_notes || null,
      })
      .select("id,code")
      .single();
    if (oErr) throw new Error(oErr.message);

    const { error: liErr } = await supabaseAdmin.from("shop_order_items").insert(
      lines.map((l) => ({
        order_id: order.id, product_id: l.productId, product_name: l.name,
        unit_price_usd: l.unitPrice, quantity: l.qty, line_total_usd: l.lineTotal, notes: l.notes,
      })),
    );
    if (liErr) throw new Error(liErr.message);

    notifyShopCustomerOrderCreated({
      shopId: data.shop_id, shopName: shop.name, orderId: order.id, code: order.code,
      phone: data.customer_phone, lines, productTotal: subtotal, deliveryFee, zone: zoneName || "à préciser",
    }).catch((e) => console.warn("[createShopOrder] notif client échouée:", e?.message));

    return { orderId: order.id as string, code: (order.code as string) ?? null, subtotal, deliveryFee, total: subtotal + deliveryFee };
  });

// ---------- CLIENT : suivi de commande ----------
export const getMyShopOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase
      .from("shop_orders")
      .select("*, items:shop_order_items(*), history:shop_order_status_history(status,created_at,note), shop:shops(name,logo_url,whatsapp_display)")
      .eq("id", data.order_id)
      .single();
    if (error) throw new Error("Commande introuvable.");
    return { order };
  });

// ---------- CLIENT : paiement FlexPay (par boutique) ----------
export const initiateShopFlexpayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid(), phone: z.string().min(8).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("shop_orders").select("id,shop_id,code,customer_id,total_usd,payment_method,payment_status")
      .eq("id", data.order_id).maybeSingle();
    if (!order || order.customer_id !== userId) return { ok: false as const, error: "Commande introuvable." };
    if (order.payment_status === "paid") return { ok: false as const, error: "Cette commande est déjà payée." };

    const cfg = await getFlexpayConfig(await loadShopIntegrationConfig(order.shop_id));
    if (!cfg) return { ok: false as const, error: "FlexPay non configuré pour cette boutique." };

    const usd = Number(order.total_usd ?? 0);
    let amount = usd;
    if (cfg.currency === "CDF") {
      const rate = await getCdfRate();
      amount = Math.max(1, Math.round(usd * rate));
    }
    const reference = `SHOP-${order.code ?? order.id.slice(0, 8)}-${Date.now().toString().slice(-6)}`;

    const result = await flexpayInitiateMobileMoney({ cfg, phone: data.phone, amount, reference, currency: cfg.currency });
    if (!result.ok) return { ok: false as const, error: result.error || "Échec de l'initiation du paiement." };

    await supabaseAdmin.from("shop_payments").insert({
      order_id: order.id, method: order.payment_method, status: "pending", amount_usd: usd,
      provider: "flexpay", provider_ref: result.orderNumber, provider_status: "pending",
      phone: phoneDigits(data.phone), currency: cfg.currency, raw: result.raw,
    });
    return { ok: true as const, orderNumber: result.orderNumber, amount, currency: cfg.currency };
  });

export const checkShopFlexpayStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("shop_orders").select("id,shop_id,customer_id,payment_status")
      .eq("id", data.order_id).maybeSingle();
    if (!order || order.customer_id !== userId) return { ok: false as const, status: "pending" as const, error: "Commande introuvable." };
    if (order.payment_status === "paid") return { ok: true as const, status: "success" as const };

    const cfg = await getFlexpayConfig(await loadShopIntegrationConfig(order.shop_id));
    if (!cfg) return { ok: false as const, status: "pending" as const, error: "FlexPay non configuré." };

    const { data: pay } = await supabaseAdmin
      .from("shop_payments").select("id,provider_ref").eq("order_id", order.id).eq("provider", "flexpay")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!pay?.provider_ref) return { ok: false as const, status: "pending" as const, error: "Aucun paiement en cours." };

    const { status, raw } = await flexpayCheck(pay.provider_ref, cfg);
    if (status === "success") {
      await supabaseAdmin.from("shop_payments").update({ status: "paid", provider_status: "success", updated_at: new Date().toISOString(), raw }).eq("id", pay.id);
      await supabaseAdmin.from("shop_orders").update({ payment_status: "paid" }).eq("id", order.id);
    } else if (status === "failed") {
      await supabaseAdmin.from("shop_payments").update({ status: "failed", provider_status: "failed", raw }).eq("id", pay.id);
      await supabaseAdmin.from("shop_orders").update({ payment_status: "failed" }).eq("id", order.id);
    }
    return { ok: true as const, status };
  });

// ---------- OWNER : back-office commandes ----------
export const getOwnerShopOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ shop_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertShopAccess(context.userId, data.shop_id, ["manager", "staff"]);
    const { data: orders, error } = await supabaseAdmin
      .from("shop_orders")
      .select("*, items:shop_order_items(product_name,quantity,unit_price_usd,line_total_usd,notes)")
      .eq("shop_id", data.shop_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { orders: orders ?? [] };
  });

export const ownerUpdateShopOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    order_id: z.string().uuid(),
    status: z.enum(ORDER_STATUSES),
    note: z.string().max(300).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order } = await supabaseAdmin
      .from("shop_orders")
      .select("id,shop_id,customer_phone,code")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order) throw new Error("Commande introuvable.");
    await assertShopAccess(context.userId, order.shop_id, ["manager", "staff"]);

    const { data: shopRow } = await supabaseAdmin.from("shops").select("name").eq("id", order.shop_id).maybeSingle();

    const { error } = await supabaseAdmin.from("shop_orders").update({ status: data.status }).eq("id", data.order_id);
    if (error) throw new Error(error.message);

    if (data.note) {
      const { data: lastHist } = await supabaseAdmin
        .from("shop_order_status_history").select("id")
        .eq("order_id", data.order_id).eq("status", data.status)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (lastHist) await supabaseAdmin.from("shop_order_status_history").update({ note: data.note }).eq("id", lastHist.id);
    }

    notifyShopCustomerStatusChanged({
      shopId: order.shop_id, shopName: shopRow?.name ?? "", orderId: order.id, code: order.code, phone: order.customer_phone, status: data.status,
    }).catch((e) => console.warn("[ownerUpdateShopOrderStatus] notif client échouée:", e?.message));

    return { ok: true };
  });
