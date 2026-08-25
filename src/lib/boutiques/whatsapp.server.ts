// Notifications WhatsApp Business PAR boutique — réutilise l'intégration
// WhatsApp Cloud API déjà construite pour JuntoxShop (src/lib/integrations/
// whatsapp.server.ts, mêmes fonctions bas niveau sendWhatsAppText/Template),
// mais avec des identifiants (numéro, token) propres à chaque boutique
// cliente, chargés depuis boutique_integration_settings — jamais partagés
// avec le compte WhatsApp Business JuntoxShop ni entre boutiques.
//
// Toujours best-effort : un échec d'envoi (token pas encore configuré,
// panne réseau) ne doit JAMAIS faire échouer la commande/le changement de
// statut qui l'a déclenché.
import { getWhatsappConfig, sendWhatsAppText } from "@/lib/integrations/whatsapp.server";
import { loadBoutiqueIntegrationConfig } from "@/lib/boutiques/integration-config.server";

async function envoyerSiConfigure(boutiqueId: string, telephone: string, message: string): Promise<void> {
  try {
    const cfg = await getWhatsappConfig(await loadBoutiqueIntegrationConfig(boutiqueId));
    if (!cfg) return; // pas encore configuré pour cette boutique — silencieux, pas une erreur
    const r = await sendWhatsAppText(cfg, telephone, message);
    if (!r.ok) console.warn(`[boutique-whatsapp] échec envoi (boutique ${boutiqueId}):`, r.error);
  } catch (e) {
    console.error(`[boutique-whatsapp] erreur envoi (boutique ${boutiqueId}):`, e);
  }
}

export async function notifierConfirmationCommande(params: {
  boutiqueId: string; boutiqueNom: string; telephone: string; numero: string; totalUsd: number;
}): Promise<void> {
  const msg =
    `${params.boutiqueNom}\n` +
    `Merci pour ta commande ${params.numero} !\n` +
    `Total : ${params.totalUsd} $\n` +
    `Nous te tiendrons informé(e) de son statut.`;
  await envoyerSiConfigure(params.boutiqueId, params.telephone, msg);
}

const STATUT_MSG: Record<string, string> = {
  confirmee: "Ta commande a été confirmée et est en préparation.",
  expediee: "Ta commande est en cours de livraison.",
  livree: "Ta commande a été livrée. Merci de ta confiance !",
  annulee: "Ta commande a été annulée.",
};

export async function notifierChangementStatut(params: {
  boutiqueId: string; boutiqueNom: string; telephone: string; numero: string; statut: string;
}): Promise<void> {
  const texte = STATUT_MSG[params.statut];
  if (!texte) return; // 'en_attente' par ex. : pas de notif (déjà couvert par la confirmation initiale)
  const msg = `${params.boutiqueNom}\nCommande ${params.numero} : ${texte}`;
  await envoyerSiConfigure(params.boutiqueId, params.telephone, msg);
}

export async function notifierPanierAbandonne(params: {
  boutiqueId: string; boutiqueNom: string; telephone: string;
}): Promise<void> {
  const msg = `${params.boutiqueNom}\nTu as laissé des articles dans ton panier ! Reviens vite pour finaliser ta commande.`;
  await envoyerSiConfigure(params.boutiqueId, params.telephone, msg);
}
