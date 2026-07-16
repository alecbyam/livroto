// Numéro WhatsApp officiel du support Livroto.
export const LIVROTO_WHATSAPP = "243988648433";

export type OrderLine = { name: string; qty: number; lineTotal: number };

/**
 * Corps commun à TOUS les messages de commande — client→support (panier, achat
 * direct) ET serveur→vendeur/livreurs (notifications.functions.ts) : lignes
 * d'articles, remises éventuelles, totaux. Source unique (audit D-1) : avant, ce
 * récapitulatif était reconstruit à 3 endroits avec des formats qui avaient déjà
 * divergé (émojis, ordre des lignes, libellés). Toute évolution (devise, code de
 * suivi…) se fait ici, une seule fois.
 */
export function orderSummaryLines(p: {
  lines: OrderLine[];
  productTotal: number;
  deliveryFee: number;
  zone: string;
  discount?: number;
  discountCode?: string | null;
  credit?: number;
}): string[] {
  const out = p.lines.map((l) => `• ${l.name} x${l.qty} — $${l.lineTotal.toFixed(2)}`);
  if (p.discount && p.discount > 0) {
    out.push(`Code promo${p.discountCode ? ` ${p.discountCode}` : ""} : -$${p.discount.toFixed(2)}`);
  }
  if (p.credit && p.credit > 0) out.push(`Crédit Livroto : -$${p.credit.toFixed(2)}`);
  out.push(`Total produits : $${p.productTotal.toFixed(2)}`);
  out.push(`Livraison (${p.zone}) : $${p.deliveryFee.toFixed(2)}`);
  out.push(`*TOTAL À PAYER : $${(p.productTotal + p.deliveryFee).toFixed(2)}*`);
  return out;
}

/** Message client → support Livroto (panier multi-articles ou achat direct). */
export function buildCustomerOrderMessage(p: {
  codes: string[];
  lines: OrderLine[];
  productTotal: number;
  deliveryFee: number;
  zone: string;
  address: string;
  customerName: string;
  payment?: string;
  discount?: number;
  discountCode?: string | null;
  credit?: number;
  gps?: { lat: number; lng: number } | null;
}): string {
  const codeLabel = p.codes.filter(Boolean).join(", ");
  const head = `Bonjour Livroto ! Nouvelle commande${codeLabel ? ` (${codeLabel})` : ""} :`;
  const body = orderSummaryLines(p);
  if (p.gps) body.push(`📍 Position GPS : https://maps.google.com/?q=${p.gps.lat},${p.gps.lng}`);
  const footer =
    `Adresse : ${p.address}, ${p.zone}.` +
    (p.payment ? ` Paiement : ${p.payment}.` : "") +
    ` Nom : ${p.customerName}.`;
  return [head, ...body, footer].join("\n");
}

/** URL wa.me prête à ouvrir pour le message client → support. */
export function customerOrderWaUrl(
  p: Parameters<typeof buildCustomerOrderMessage>[0],
): string {
  return `https://wa.me/${LIVROTO_WHATSAPP}?text=${encodeURIComponent(buildCustomerOrderMessage(p))}`;
}

export function genericWhatsAppUrl(text = "Bonjour Livroto ! J'ai une question.") {
  return `https://wa.me/${LIVROTO_WHATSAPP}?text=${encodeURIComponent(text)}`;
}
