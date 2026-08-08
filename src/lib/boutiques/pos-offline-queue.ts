// File d'attente hors-ligne du POS boutique — même principe que
// src/lib/offline-queue.ts (commandes marketplace), mais un module séparé
// car la forme des données diffère (vente boutique, pas commande livraison)
// et les deux ne doivent jamais se mélanger dans le même localStorage.
export type QueuedVente = {
  id: string; // = hors_ligne_id envoyé au serveur, sert aussi de clé de dédoublonnage
  createdAt: string; // bookkeeping local (moment de la mise en file) — PAS la date de la vente, voir date_vente
  // Date/heure réelle choisie pour la vente (par défaut l'instant présent au
  // moment de l'encaissement, modifiable par la caissière) — figée ici, PAS
  // recalculée à la resynchronisation, sinon une vente prise hors-ligne à
  // 14h se retrouverait datée de l'heure de reconnexion sur la facture et
  // dans les rapports.
  date_vente: string;
  attempts?: number;
  boutique_id: string;
  client_id?: string | null;
  mode_paiement: "cash" | "mobile_money" | "carte" | "credit";
  code_promo?: string | null;
  lignes: Array<{
    produit_id: string;
    nom: string;
    quantite: number;
    prix_unitaire_usd: number; // prix réellement appliqué (remisé ou non) — pour le reçu imprimé hors-ligne
    // Prix catalogue/promo au moment de l'ajout — sert à distinguer une VRAIE
    // remise manuelle (à transmettre et faire valider par le serveur) d'un
    // prix normal (qu'il vaut mieux laisser le serveur recalculer lui-même —
    // plus fiable si le prix catalogue a changé pendant la coupure réseau).
    prix_catalogue_usd: number;
  }>;
  // Rempli UNIQUEMENT si mode_paiement === "credit". `client_id` (champ
  // ci-dessus) est déjà résolu si la vente avait pu joindre le serveur en
  // ligne pour trouver/créer le client puis a échoué plus loin — sinon
  // (vente commencée hors-ligne d'entrée) le client ne peut pas être
  // recherché/créé sans réseau : nom+téléphone sont saisis à la main ici et
  // résolus en find-or-create (boutiqueTrouverOuCreerClient) au moment de la
  // resynchronisation, juste avant l'appel à boutiqueEncaisserVente — jamais
  // de client_id local inventé, toujours résolu en confiance côté serveur.
  credit?: {
    client_nom?: string;
    client_telephone?: string;
    date_echeance: string;
    notes?: string | null;
    avance_usd?: number | null;
    avance_mode_paiement?: "cash" | "mobile_money" | "carte" | null;
  };
};

const KEY = "livroto.boutique.pos.offline.ventes";

function load(): QueuedVente[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(ventes: QueuedVente[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(ventes));
  } catch {}
}

export const posOfflineQueue = {
  count(): number {
    return load().length;
  },
  add(vente: QueuedVente): void {
    const ventes = load();
    ventes.push(vente);
    save(ventes);
  },
  getAll(): QueuedVente[] {
    return load();
  },
  remove(id: string): void {
    save(load().filter((v) => v.id !== id));
  },
  bumpAttempt(id: string): number {
    const ventes = load();
    const v = ventes.find((x) => x.id === id);
    if (!v) return 0;
    v.attempts = (v.attempts ?? 0) + 1;
    save(ventes);
    return v.attempts;
  },
  clear(): void {
    save([]);
  },
};

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
