import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendAfricasTalkingSMS, STATUS_SMS } from "./sms.functions";
import { getPublicFlag } from "@/lib/integrations/config.server";
import { getWhatsappConfig, sendWhatsAppText } from "@/lib/integrations/whatsapp.server";
import { phoneDigits } from "@/lib/phone";
import { orderSummaryLines, type OrderLine } from "@/lib/whatsapp";

// CallMeBot WhatsApp sender.
// Each recipient must have activated CallMeBot on his own WhatsApp number
// and shared his personal apikey (stored in vendors/riders.callmebot_apikey).
// Docs: https://www.callmebot.com/blog/free-api-whatsapp-messages/
async function sendCallMeBot(phone: string, text: string, apikey: string) {
  const cleanPhone = phoneDigits(phone);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(
    cleanPhone,
  )}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  try {
    const res = await fetch(url, { method: "GET" });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (e: any) {
    return { ok: false, status: 0, body: e?.message ?? "fetch error" };
  }
}

function logNotification(params: {
  user_id: string;
  order_id: string | null;
  to_phone: string;
  payload: any;
  ok: boolean;
  error?: string;
}) {
  return supabaseAdmin.from("notifications").insert({
    user_id: params.user_id,
    order_id: params.order_id,
    to_phone: params.to_phone,
    channel: "whatsapp",
    status: params.ok ? "sent" : "failed",
    sent_at: params.ok ? new Date().toISOString() : null,
    error: params.error ?? null,
    payload: params.payload,
  });
}

// Notify vendor + available riders that a new order has been created.
// Fire-and-forget from the client; uses service role to access all sides.
export const notifyOrderCreated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id,code,customer_id,customer_name,customer_phone,customer_address,zone,total_usd,delivery_fee,vendor_id,quantity,payment_method,customer_notes")
      .eq("id", data.order_id)
      .maybeSingle();
    if (oErr || !order) throw new Error(oErr?.message ?? "Commande introuvable");
    // Sécurité (audit A-2) : le client admin contourne la RLS, donc on vérifie
    // EXPLICITEMENT que l'appelant est bien le client qui a créé la commande.
    // Sinon n'importe quel utilisateur connecté pourrait déclencher les notifs
    // vendeur/livreurs d'une commande arbitraire via son id.
    if (order.customer_id !== userId) throw new Error("Forbidden: not your order");

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_name,quantity,unit_price_usd,line_total_usd")
      .eq("order_id", order.id);

    // Récapitulatif articles + totaux : même source unique que les messages
    // client → support (lib/whatsapp.ts, audit D-1) — plus de format divergent.
    const lines: OrderLine[] = (items ?? []).map((it: any) => ({
      name: it.product_name,
      qty: Number(it.quantity),
      lineTotal: Number(it.line_total_usd ?? it.quantity * it.unit_price_usd),
    }));
    const body = orderSummaryLines({
      lines,
      productTotal: Number(order.total_usd),
      deliveryFee: Number(order.delivery_fee ?? 0),
      zone: order.zone,
    });
    // Vieilles commandes sans lignes d'articles : on garde au moins la quantité.
    if (lines.length === 0) body.unshift(`Quantité ${order.quantity}`);

    const codeLabel = order.code ?? order.id.slice(0, 8);
    const baseText =
      `🛒 Livroto — Nouvelle commande ${codeLabel}\n` +
      `Client: ${order.customer_name} (${order.customer_phone})\n` +
      `Quartier: ${order.zone}\n` +
      `Adresse: ${order.customer_address}\n` +
      `${body.join("\n")}\n` +
      `Paiement: ${order.payment_method}` +
      (order.customer_notes ? `\nNote: ${order.customer_notes}` : "");

    const results: { target: string; ok: boolean }[] = [];

    // 1) Notify the vendor
    if (order.vendor_id) {
      const { data: vendor } = await supabaseAdmin
        .from("vendors")
        .select("id,owner_id,whatsapp,callmebot_apikey,shop_name")
        .eq("id", order.vendor_id)
        .maybeSingle();
      if (vendor?.whatsapp && vendor.callmebot_apikey) {
        const vText = `[${vendor.shop_name}]\n${baseText}`;
        const r = await sendCallMeBot(vendor.whatsapp, vText, vendor.callmebot_apikey);
        await logNotification({
          user_id: vendor.owner_id,
          order_id: order.id,
          to_phone: vendor.whatsapp,
          payload: { kind: "vendor_new_order", code: codeLabel },
          ok: r.ok,
          error: r.ok ? undefined : `HTTP ${r.status}: ${r.body.slice(0, 200)}`,
        });
        results.push({ target: "vendor", ok: r.ok });
      } else {
        results.push({ target: "vendor", ok: false });
      }
    }

    // 2) Notify all available riders that have a CallMeBot key
    const { data: riders } = await supabaseAdmin
      .from("riders")
      .select("id,user_id,whatsapp,callmebot_apikey")
      .eq("status", "active")
      .eq("is_available", true)
      .not("callmebot_apikey", "is", null);

    for (const rider of riders ?? []) {
      if (!rider.whatsapp || !rider.callmebot_apikey) continue;
      const rText = `🛵 Livroto — Course dispo ${codeLabel}\n${baseText}\n👉 Ouvre l'app pour la prendre.`;
      const r = await sendCallMeBot(rider.whatsapp, rText, rider.callmebot_apikey);
      await logNotification({
        user_id: rider.user_id,
        order_id: order.id,
        to_phone: rider.whatsapp,
        payload: { kind: "rider_new_order", code: codeLabel },
        ok: r.ok,
        error: r.ok ? undefined : `HTTP ${r.status}: ${r.body.slice(0, 200)}`,
      });
      results.push({ target: `rider:${rider.id}`, ok: r.ok });
    }

    return { ok: true, sent: results.length, results, caller: userId };
  });

// Save / update the CallMeBot apikey for the current vendor or rider profile.
export const saveCallmebotApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      role: z.enum(["vendor", "rider", "customer"]),
      apikey: z.string().min(3).max(64).regex(/^[A-Za-z0-9_-]+$/),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.role === "vendor") {
      const { error } = await supabase
        .from("vendors")
        .update({ callmebot_apikey: data.apikey })
        .eq("owner_id", userId);
      if (error) throw new Error(error.message);
    } else if (data.role === "rider") {
      const { error } = await supabase
        .from("riders")
        .update({ callmebot_apikey: data.apikey })
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("profiles")
        .update({ callmebot_apikey: data.apikey })
        .eq("id", userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// Notify the customer that his order status changed (if he has a CallMeBot key).
const STATUS_MSG: Record<string, string> = {
  confirmed: "✅ Ta commande a été confirmée par le vendeur.",
  ready: "📦 Ta commande est prête, un livreur est en route.",
  picked_up: "🛵 Le livreur a pris ta commande, il arrive !",
  delivered: "🎉 Ta commande a été livrée. Bon appétit / bonne utilisation !",
  cancelled: "❌ Ta commande a été annulée.",
};

export const notifyOrderStatusChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      order_id: z.string().uuid(),
      status: z.string().min(2).max(20),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,code,customer_id,vendor_id,rider_id,customer_name,customer_phone,total_usd,delivery_fee")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order || !order.customer_id) return { ok: false, reason: "no_order" };
    // Sécurité (audit A-2) : admin contourne la RLS → seuls le vendeur ou le livreur
    // de la commande peuvent en notifier le changement de statut (ce sont les seuls
    // appelants : VendorPanel / RiderPanel). Sans ça, n'importe quel utilisateur
    // connecté pourrait envoyer au client un faux statut ("livrée"…) par WhatsApp/SMS.
    if (order.vendor_id !== userId && order.rider_id !== userId) {
      return { ok: false, reason: "forbidden" };
    }

    const codeLabel = order.code ?? order.id.slice(0, 8);

    // Notification in-app (cloche) — créée systématiquement, indépendante du téléphone
    await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: order.customer_id,
        order_id: order.id,
        channel: "in_app",
        status: "sent",
        sent_at: new Date().toISOString(),
        payload: { kind: "status", status: data.status, code: codeLabel, message: STATUS_MSG[data.status] ?? `Statut : ${data.status}` },
      })
      .then(undefined, () => {});

    if (!order.customer_phone) return { ok: true, channel: "in_app" };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("callmebot_apikey")
      .eq("id", order.customer_id)
      .maybeSingle();

    const statusMsg = STATUS_MSG[data.status] ?? `Statut : ${data.status}`;
    const msg =
      `Livroto — Commande ${codeLabel}\n` +
      `${statusMsg}\n` +
      `Total à payer : $${(Number(order.total_usd) + Number(order.delivery_fee ?? 0)).toFixed(2)} (livraison incluse)`;

    let waOk = false;

    // 1) Canal préféré : WhatsApp Cloud API (Meta) si l'intégration est activée + configurée.
    if (await getPublicFlag("whatsapp_enabled")) {
      const waCfg = await getWhatsappConfig();
      if (waCfg) {
        const r = await sendWhatsAppText(waCfg, order.customer_phone, msg);
        waOk = r.ok;
        await logNotification({
          user_id: order.customer_id,
          order_id: order.id,
          to_phone: order.customer_phone,
          payload: { kind: "customer_status", status: data.status, code: codeLabel, via: "whatsapp_cloud" },
          ok: r.ok,
          error: r.ok ? undefined : String(r.error ?? "").slice(0, 200),
        });
      }
    }

    // 2) Sinon : WhatsApp via CallMeBot si le client a configuré sa clé.
    if (!waOk && profile?.callmebot_apikey) {
      const r = await sendCallMeBot(order.customer_phone, msg, profile.callmebot_apikey);
      waOk = r.ok;
      await logNotification({
        user_id: order.customer_id,
        order_id: order.id,
        to_phone: order.customer_phone,
        payload: { kind: "customer_status", status: data.status, code: codeLabel, via: "callmebot" },
        ok: r.ok,
        error: r.ok ? undefined : `HTTP ${r.status}: ${r.body.slice(0, 200)}`,
      });
    }

    // 3) Fallback SMS : si aucun canal WhatsApp n'a fonctionné,
    //    on bascule sur Africa's Talking (couvre Airtel/Vodacom/Orange à Bunia).
    if (!waOk && STATUS_SMS[data.status]) {
      const smsText = `${STATUS_SMS[data.status]} (Cmd #${codeLabel})`;
      const sms = await sendAfricasTalkingSMS(order.customer_phone, smsText);
      await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: order.customer_id,
          order_id: order.id,
          to_phone: order.customer_phone,
          channel: "sms",
          status: sms.ok ? "sent" : "failed",
          sent_at: sms.ok ? new Date().toISOString() : null,
          error: sms.error ?? null,
          payload: { kind: "customer_status_sms", status: data.status, code: codeLabel },
        })
        .then(undefined, () => {});
      return { ok: sms.ok, channel: "sms", fallback: true };
    }

    return { ok: waOk, channel: "whatsapp" };
  });

// ---------- Notifications in-app (cloche) ----------
export const getMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("notifications")
      .select("id,order_id,payload,read_at,created_at")
      .eq("user_id", userId)
      .eq("channel", "in_app")
      .order("created_at", { ascending: false })
      .limit(20);
    const list = data ?? [];
    const unread = list.filter((n: any) => !n.read_at).length;
    return { list, unread };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const { userId } = context;
    await supabaseAdmin
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("channel", "in_app")
      .is("read_at", null);
    return { ok: true };
  });