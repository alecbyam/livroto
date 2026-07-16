/**
 * File d'attente hors-ligne pour les commandes.
 * Sauvegarde les commandes dans localStorage quand internet est absent,
 * et les soumet automatiquement à la reconnexion.
 */

export type QueuedOrder = {
  id: string;            // UUID local temporaire
  createdAt: string;
  attempts?: number;     // nombre d'envois ratés (anti-zombie, voir OfflineBanner)
  payload: Record<string, unknown>;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price_usd: number;
    line_total_usd: number;
    vendor_id: string | null;
  }>;
  customerName: string;
  zone: string;
};

const KEY = "livroto.offline.orders";

function load(): QueuedOrder[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(orders: QueuedOrder[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(orders));
  } catch {}
}

export const offlineQueue = {
  count(): number {
    return load().length;
  },

  add(order: QueuedOrder): void {
    const orders = load();
    orders.push(order);
    save(orders);
  },

  getAll(): QueuedOrder[] {
    return load();
  },

  remove(id: string): void {
    save(load().filter((o) => o.id !== id));
  },

  /** Incrémente le compteur d'échecs d'une commande et renvoie sa nouvelle valeur. */
  bumpAttempt(id: string): number {
    const orders = load();
    const o = orders.find((x) => x.id === id);
    if (!o) return 0;
    o.attempts = (o.attempts ?? 0) + 1;
    save(orders);
    return o.attempts;
  },

  clear(): void {
    save([]);
  },
};

/** Retourne true si le navigateur a de l'internet (non fiable à 100% mais utile) */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
