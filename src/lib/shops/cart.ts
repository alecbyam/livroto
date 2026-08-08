// ============================================================================
// Panier local pour le module boutique générique. Volontairement plus simple
// que src/lib/cart.tsx (panier marketplace multi-vendeur avec sync serveur) :
// une boutique = un panier, localStorage uniquement, capturé au moment du
// checkout. Pas besoin de fusion cross-device pour une commande resto rapide.
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";

export type ShopCartItem = {
  id: string; // shop_products.id
  name: string;
  price_usd: number;
  image_url: string | null;
  qty: number;
  notes?: string;
};

function storageKey(shopId: string) {
  return `livroto.shop-cart.${shopId}.v1`;
}

export function useShopCart(shopId: string) {
  const [items, setItems] = useState<ShopCartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey(shopId));
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, [shopId]);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(storageKey(shopId), JSON.stringify(items)); } catch {}
  }, [items, hydrated, shopId]);

  const add = useCallback((item: Omit<ShopCartItem, "qty">, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((p) => p.id === item.id);
      if (existing) return prev.map((p) => (p.id === item.id ? { ...p, qty: p.qty + qty } : p));
      return [...prev, { ...item, qty }];
    });
  }, []);
  const setQty = useCallback((id: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((p) => p.id !== id);
      return prev.map((p) => (p.id === id ? { ...p, qty } : p));
    });
  }, []);
  const remove = useCallback((id: string) => setItems((prev) => prev.filter((p) => p.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);
  const subtotal = useMemo(() => items.reduce((s, i) => s + i.qty * i.price_usd, 0), [items]);

  return { items, count, subtotal, add, setQty, remove, clear };
}
