// Numéro WhatsApp officiel du support Livroto.
export const LIVROTO_WHATSAPP = "243988648433";

export function buildOrderWhatsAppUrl(params: {
  productName: string;
  quantity: number;
  address: string;
  zone: string;
  name: string;
}) {
  const msg = `Bonjour Livroto ! Je veux commander : ${params.productName} x${params.quantity} — Livraison à ${params.address}, ${params.zone}. Mon nom : ${params.name}. Merci !`;
  return `https://wa.me/${LIVROTO_WHATSAPP}?text=${encodeURIComponent(msg)}`;
}

export function genericWhatsAppUrl(text = "Bonjour Livroto ! J'ai une question.") {
  return `https://wa.me/${LIVROTO_WHATSAPP}?text=${encodeURIComponent(text)}`;
}