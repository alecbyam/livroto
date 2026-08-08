// ============================================================================
// Notifications de commande — boutique générique. SERVER ONLY.
//
// Client (confirmation + suivi de statut) : WhatsApp Business Cloud API DE LA
// BOUTIQUE si elle a configuré ses propres identifiants (shop_integration_settings) —
// c'est le point central de la demande « chaque boutique son propre compte
// WhatsApp Business ». Tant que la boutique n'a pas encore de compte Meta
// vérifié, l'intégration reste "dormante" (aucun envoi, pas d'erreur) et la
// notification reste tracée dans shop_notifications pour audit/suivi manuel.
//
// Owner (nouvelle commande) : pour l'instant en-app uniquement (liste des
// commandes du back-office) — pas de canal externe inventé qui n'a pas été
// demandé. Peut évoluer plus tard (ex: lien perso façon CallMeBot) sans
// changer ce fichier de logique.
// ============================================================================
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadShopIntegrationConfig } from "@/lib/integrations/shop-config.server";
import { getWhatsappConfig, sendWhatsAppText } from "@/lib/integrations/whatsapp.server";
import { orderSummaryLines, type OrderLine } from "@/lib/whatsapp";

async function logShopNotification(row: {
  shop_id: string;
  order_id: string;
  to_phone: string | null;
  ok: boolean;
  error?: string;
  kind: string;
}) {
  await supabaseAdmin.from("shop_notifications").insert({
    shop_id: row.shop_id,
    order_id: row.order_id,
    channel: "whatsapp",
    status: row.ok ? "sent" : "failed",
    to_phone: row.to_phone,
    payload: { kind: row.kind },
    error: row.ok ? null : (row.error ?? "").slice(0, 200),
    sent_at: row.ok ? new Date().toISOString() : null,
  });
}

/** Notifie le client d'une confirmation de commande via le WhatsApp Business de la boutique (si configuré). */
export async function notifyShopCustomerOrderCreated(params: {
  shopId: string;
  shopName: string;
  orderId: string;
  code: string | null;
  phone: string;
  lines: OrderLine[];
  productTotal: number;
  deliveryFee: number;
  zone: string;
}) {
  const cfg = await getWhatsappConfig(await loadShopIntegrationConfig(params.shopId));
  if (!cfg) return; // intégration dormante : rien à envoyer, rien à logger (pas d'échec, juste pas configuré)

  const body = [
    `Bonjour ! Ta commande chez ${params.shopName}${params.code ? ` (${params.code})` : ""} est bien reçue :`,
    ...orderSummaryLines({ lines: params.lines, productTotal: params.productTotal, deliveryFee: params.deliveryFee, zone: params.zone }),
    `On te tient au courant dès qu'elle est en préparation 👨‍🍳`,
  ].join("\n");

  const r = await sendWhatsAppText(cfg, params.phone, body);
  await logShopNotification({ shop_id: params.shopId, order_id: params.orderId, to_phone: params.phone, ok: r.ok, error: r.error, kind: "customer_order_created" });
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "confirmée ✅",
  preparing: "en préparation 👨‍🍳",
  ready: "prête, en attente de livraison/retrait 🛎️",
  picked_up: "en route vers toi 🛵",
  delivered: "livrée, bon appétit ! 🎉",
  cancelled: "annulée ❌",
};

/** Notifie le client d'un changement de statut via le WhatsApp Business de la boutique (si configuré). */
export async function notifyShopCustomerStatusChanged(params: {
  shopId: string;
  shopName: string;
  orderId: string;
  code: string | null;
  phone: string;
  status: string;
}) {
  const cfg = await getWhatsappConfig(await loadShopIntegrationConfig(params.shopId));
  if (!cfg) return;

  const label = STATUS_LABEL[params.status] ?? params.status;
  const body = `${params.shopName} — Ta commande${params.code ? ` ${params.code}` : ""} est ${label}`;

  const r = await sendWhatsAppText(cfg, params.phone, body);
  await logShopNotification({ shop_id: params.shopId, order_id: params.orderId, to_phone: params.phone, ok: r.ok, error: r.error, kind: "customer_status" });
}
