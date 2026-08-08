// ============================================================================
// Panier local pour le module boutique générique. Volontairement plus simple
// que src/lib/cart.tsx (panier marketplace multi-vendeur avec sync serveur) :
// une boutique = un panier, localStorage uniquement, capturé au moment du
// checkout. Chaque ligne est identifiée par produit + choix d'options
// sélectionnés (deux configurations différentes du même plat = deux lignes).
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";

export type ShopCartItem = {
  cartLineId: string;         // productId + choix triés — clé unique de la ligne
  productId: string;
  name: string;                // inclut le libellé des options choisies
  price_usd: number;           // prix unitaire, options incluses
  image_url: string | null;
  qty: number;
  notes?: string;
  selectedChoiceIds: string[];
};

function storageKey(shopId: string) {
  return `livroto.shop-cart.${shopId}.v2`;
}

export function makeCartLineId(productId: string, choiceIds: string[]) {
  return `${productId}::${[...choiceIds].sort().join(",")}`;
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
      const existing = prev.find((p) => p.cartLineId === item.cartLineId);
      if (existing) return prev.map((p) => (p.cartLineId === item.cartLineId ? { ...p, qty: p.qty + qty } : p));
      return [...prev, { ...item, qty }];
    });
  }, []);
  const setQty = useCallback((cartLineId: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((p) => p.cartLineId !== cartLineId);
      return prev.map((p) => (p.cartLineId === cartLineId ? { ...p, qty } : p));
    });
  }, []);
  const remove = useCallback((cartLineId: string) => setItems((prev) => prev.filter((p) => p.cartLineId !== cartLineId)), []);
  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(() => items.reduce((s, i) => s + i.qty, 0), [items]);
  const subtotal = useMemo(() => items.reduce((s, i) => s + i.qty * i.price_usd, 0), [items]);

  return { items, count, subtotal, add, setQty, remove, clear };
}
