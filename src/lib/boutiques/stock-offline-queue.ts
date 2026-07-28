// File d'attente hors-ligne pour les AJUSTEMENTS DE STOCK manuels (gestion de
// boutique, pas seulement la caisse) — même principe que pos-offline-queue.ts
// mais pour boutiqueAjusterStock. Permet à un gérant de compter/corriger son
// stock même sans réseau (contexte Bunia), synchronisé à la reconnexion.
export type AjustementEnAttente = {
  id: string; // idempotence
  createdAt: string;
  attempts?: number;
  boutique_id: string;
  produit_id: string;
  type: "entree" | "sortie" | "ajustement";
  quantite_delta: number;
  motif?: string;
};

const KEY = "livroto.boutique.stock.offline.ajustements";

function load(): AjustementEnAttente[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function save(items: AjustementEnAttente[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
}

export const stockOfflineQueue = {
  count(): number { return load().length; },
  add(item: AjustementEnAttente): void { const items = load(); items.push(item); save(items); },
  getAll(): AjustementEnAttente[] { return load(); },
  remove(id: string): void { save(load().filter((i) => i.id !== id)); },
  bumpAttempt(id: string): number {
    const items = load();
    const it = items.find((x) => x.id === id);
    if (!it) return 0;
    it.attempts = (it.attempts ?? 0) + 1;
    save(items);
    return it.attempts;
  },
  // Delta net en attente pour un produit donné — utilisé pour afficher un
  // stock "optimiste" à jour même avant que la synchro serveur ne confirme.
  deltaEnAttente(produitId: string): number {
    return load().filter((i) => i.produit_id === produitId)
      .reduce((s, i) => s + (i.type === "sortie" ? -Math.abs(i.quantite_delta) : i.quantite_delta), 0);
  },
};

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
