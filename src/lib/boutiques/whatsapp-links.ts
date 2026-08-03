// Liens WhatsApp générés côté client pour le storefront boutique — pas un
// serverFn (aucune donnée sensible, juste construire une URL wa.me à ouvrir
// dans un nouvel onglet). Réutilise phoneDigits (déjà la source unique de
// normalisation de numéro dans ce repo, src/lib/phone.ts).
import { phoneDigits } from "@/lib/phone";

export function urlProduit(boutiqueSlug: string, produitId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/boutique/produit?boutique=${encodeURIComponent(boutiqueSlug)}&produit=${encodeURIComponent(produitId)}`;
}

// wa.me/?text=... (sans numéro) ouvre le sélecteur de contact natif — pour
// PARTAGER un article à qui on veut, pas pour commander auprès de la
// boutique. C'est la commande "Commander via WhatsApp" (avec le numéro de
// la boutique) qui cible directement le vendeur.
export function whatsAppPartagerUrl(params: { boutiqueNom: string; nom: string; prixUsd: number; url: string }): string {
  const texte = `👀 Regarde cet article chez ${params.boutiqueNom} !\n*${params.nom}* — ${params.prixUsd} $\n${params.url}`;
  return `https://wa.me/?text=${encodeURIComponent(texte)}`;
}

export function whatsAppCommanderProduitUrl(params: {
  telephoneBoutique: string;
  boutiqueNom: string;
  nom: string;
  prixUsd: number;
  url: string;
}): string {
  const digits = phoneDigits(params.telephoneBoutique);
  const texte = `Bonjour ${params.boutiqueNom}, je voudrais commander :\n*${params.nom}* — ${params.prixUsd} $\n${params.url}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(texte)}`;
}

// Relance d'un client qui doit encore de l'argent sur une vente à crédit —
// message pré-rempli avec le montant restant et l'échéance, envoyé au
// numéro DU CLIENT (pas de la boutique, contrairement aux autres helpers).
export function whatsAppRelanceCreditUrl(params: {
  telephoneClient: string;
  boutiqueNom: string;
  nomClient: string;
  montantRestantUsd: number;
  dateEcheance: string;
}): string {
  const digits = phoneDigits(params.telephoneClient);
  const texte = `Bonjour ${params.nomClient}, c'est ${params.boutiqueNom}. Petit rappel : il reste ${params.montantRestantUsd} $ à payer sur votre achat (échéance : ${params.dateEcheance}). Merci !`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(texte)}`;
}

export function whatsAppCommanderPanierUrl(params: {
  telephoneBoutique: string;
  boutiqueNom: string;
  lignes: Array<{ nom: string; quantite: number; prixUsd: number }>;
  totalUsd: number;
  nomClient?: string;
  adresseClient?: string;
}): string {
  const digits = phoneDigits(params.telephoneBoutique);
  const detail = params.lignes.map((l) => `• ${l.quantite}x ${l.nom} — ${(l.prixUsd * l.quantite).toFixed(2)} $`).join("\n");
  const texte = `Bonjour ${params.boutiqueNom}, je voudrais commander :\n${detail}\n\nTotal : ${params.totalUsd.toFixed(2)} $\n\nMon nom : ${params.nomClient || "…"}\nMon adresse de livraison : ${params.adresseClient || "…"}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(texte)}`;
}
