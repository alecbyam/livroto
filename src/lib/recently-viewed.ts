/**
 * Historique « vu récemment » — réflexe Amazon (recos sans cul-de-sac).
 * Stocke uniquement les IDs produit en localStorage ; les données fraîches
 * (prix/stock/note) sont relues depuis la DB à l'affichage.
 */
const KEY = "livroto.recently-viewed";
const MAX = 12;

export function recordView(productId: string): void {
  if (typeof window === "undefined" || !productId) return;
  try {
    const list = getViewedIds().filter((id) => id !== productId);
    list.unshift(productId);
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* localStorage indisponible (mode privé) — on ignore */
  }
}

export function getViewedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
