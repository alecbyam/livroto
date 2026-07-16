import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { phoneE164 } from "@/lib/phone";

/**
 * Envoi SMS via Africa's Talking — opère en RDC (Airtel, Vodacom, Orange)
 * Docs : https://developers.africastalking.com/docs/sms/sending
 */
export async function sendAfricasTalkingSMS(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const AT_USERNAME = process.env.AT_USERNAME;
  const AT_API_KEY  = process.env.AT_API_KEY;

  if (!AT_USERNAME || !AT_API_KEY) {
    console.warn("[SMS] Africa's Talking non configuré — vérifier AT_USERNAME et AT_API_KEY");
    return { ok: false, error: "AT_not_configured" };
  }

  // Normaliser le numéro : doit commencer par +
  const phone = phoneE164(to);

  try {
    const body = new URLSearchParams({
      username: AT_USERNAME,
      to:       phone,
      message:  message,
      from:     "LIVROTO",  // Sender ID (doit être approuvé en production)
    });

    const res = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        Accept:         "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        apiKey:         AT_API_KEY,
      },
      body: body.toString(),
    });

    const json = await res.json();
    const recipients = json?.SMSMessageData?.Recipients ?? [];
    const success = recipients.some((r: any) => r.status === "Success");

    if (!success) {
      console.error("[SMS] Africa's Talking échec:", JSON.stringify(json));
      return { ok: false, error: json?.SMSMessageData?.Message ?? "AT_send_failed" };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "AT_network_error" };
  }
}

// Messages SMS pour chaque statut de commande
export const STATUS_SMS: Record<string, string> = {
  confirmed: "Livroto: Commande confirmee! Le vendeur prepare ta commande. On te tient informe.",
  ready:     "Livroto: Ta commande est prete. Un livreur arrive bientot chez toi.",
  picked_up: "Livroto: Ton livreur est en route! Il arrive dans quelques minutes.",
  delivered: "Livroto: Commande livree! Merci de faire confiance a Livroto Bunia.",
  cancelled: "Livroto: Ta commande a ete annulee. Contacte-nous pour plus d'infos.",
};

/**
 * Note : le SMS de changement de statut est géré comme *fallback* dans
 * `notifyOrderStatusChanged` (notifications.functions.ts) — il part automatiquement
 * quand le client n'a pas de WhatsApp CallMeBot ou que l'envoi WhatsApp échoue.
 */

/** Envoie un SMS de confirmation au client lors de la création de commande */
export const notifyOrderCreatedSMS = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id,code,customer_id,customer_phone,customer_name,total_usd,delivery_fee,zone,payment_method")
      .eq("id", data.order_id)
      .maybeSingle();

    if (!order) return { ok: false, reason: "not_found" };
    // Sécurité (audit A-2) : admin contourne la RLS → on vérifie que l'appelant
    // est bien le client de la commande, sinon on pourrait faire envoyer un SMS
    // (crédits payants) au numéro d'une commande arbitraire.
    if (order.customer_id !== context.userId) return { ok: false, reason: "forbidden" };
    if (!order.customer_phone) return { ok: false, reason: "no_phone" };

    const codeLabel = order.code ?? order.id.slice(0, 8);
    const paymentFR = {
      cash: "cash a la livraison",
      mpesa: "M-Pesa",
      airtel_money: "Airtel Money",
      orange_money: "Orange Money",
    }[order.payment_method as string] ?? order.payment_method;

    const grandTotal = Number(order.total_usd) + Number(order.delivery_fee ?? 0);
    const msg =
      `Livroto: Cmd #${codeLabel} recue! ` +
      `Total a payer: $${grandTotal.toFixed(2)} (livraison incluse) - ${paymentFR}. ` +
      `Zone: ${order.zone}. Merci ${order.customer_name}!`;

    return await sendAfricasTalkingSMS(order.customer_phone, msg);
  });
