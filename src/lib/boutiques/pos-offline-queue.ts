// File d'attente hors-ligne du POS boutique — même principe que
// src/lib/offline-queue.ts (commandes marketplace), mais un module séparé
// car la forme des données diffère (vente boutique, pas commande livraison)
// et les deux ne doivent jamais se mélanger dans le même localStorage.
export type QueuedVente = {
  id: string; // = hors_ligne_id envoyé au serveur, sert aussi de clé de dédoublonnage
  createdAt: string;
  attempts?: number;
  boutique_id: string;
  client_id?: string | null;
  mode_paiement: "cash" | "mobile_money" | "carte";
  code_promo?: string | null;
  lignes: Array<{ produit_id: string; nom: string; quantite: number; prix_unitaire_usd: number }>;
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
