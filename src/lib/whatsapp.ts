// Numéro WhatsApp officiel du support Livroto.
export const LIVROTO_WHATSAPP = "243988648433";

export function buildOrderWhatsAppUrl(params: {
  productName: string;
  quantity: number;
  address: string;
  zone: string;
  name: string;
  productTotal?: number;
  deliveryFee?: number;
}) {
  const lines = [`Bonjour Livroto ! Je veux commander : ${params.productName} x${params.quantity}`];
  if (params.productTotal != null) lines.push(`Total produits : $${params.productTotal.toFixed(2)}`);
  if (params.deliveryFee != null) {
    lines.push(`Livraison (${params.zone}) : $${params.deliveryFee.toFixed(2)}`);
    if (params.productTotal != null) {
      lines.push(`TOTAL À PAYER : $${(params.productTotal + params.deliveryFee).toFixed(2)}`);
    }
  }
  lines.push(`Livraison à ${params.address}, ${params.zone}. Mon nom : ${params.name}. Merci !`);
  return `https://wa.me/${LIVROTO_WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export function genericWhatsAppUrl(text = "Bonjour Livroto ! J'ai une question.") {
  return `https://wa.me/${LIVROTO_WHATSAPP}?text=${encodeURIComponent(text)}`;
}