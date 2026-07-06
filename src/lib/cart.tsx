import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyCart, saveMyCart } from "@/lib/cart.functions";

export type CartItem = {
  id: string;            // product id
  name: string;
  price_usd: number;            // prix effectif (promo si active)
  original_price_usd?: number | null; // prix original si promo, pour le prix barré
  emoji?: string | null;
  image_url?: string | null;
  vendor_id: string | null;
  stock: number;
  qty: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  remove: (id: string) => void;
  setQty: (id: string, qty: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "livroto.cart.v1";

// Fusion panier serveur + panier local : union par produit, on garde la quantité la
// plus élevée (forgiving — on ne perd jamais d'article au changement d'appareil).
function mergeCarts(server: CartItem[], local: CartItem[]): CartItem[] {
  const map = new Map<string, CartItem>();
  for (const it of server) map.set(it.id, it);
  for (const it of local) {
    const existing = map.get(it.id);
    if (existing) map.set(it.id, { ...existing, qty: Math.max(existing.qty, it.qty) });
    else map.set(it.id, it);
  }
  return Array.from(map.values());
}

function readLocalCart(): CartItem[] {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const fetchCart = useServerFn(getMyCart);
  const pushCart = useServerFn(saveMyCart);
  const userIdRef = useRef<string | null>(null);   // user connecté (null = invité)
  const syncedRef = useRef(false);                  // déjà fusionné avec le serveur ?
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1) Hydratation rapide depuis localStorage (instantané, hors-ligne).
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setHydrated(true);
  }, []);

  // 2) Miroir localStorage à chaque changement.
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
  }, [items, hydrated]);

  // 3) Sync serveur : fusion au login (une fois), puis suivi de l'état de session.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mergeWithServer = async (uid: string) => {
      userIdRef.current = uid;
      if (syncedRef.current) return;
      syncedRef.current = true;
      try {
        const { items: serverItems } = await fetchCart();
        const merged = mergeCarts((serverItems ?? []) as CartItem[], readLocalCart());
        setItems(merged);
        // Garantit que le serveur a bien la version fusionnée (le local pouvait être + riche).
        pushCart({ data: { items: merged } }).catch(() => {});
      } catch { /* table absente / hors-ligne → on garde le panier local */ }
    };

    supabase.auth.getSession()
      .then(({ data }) => { if (data.session) mergeWithServer(data.session.user.id); })
      .catch(() => {});

    // ⚠️ Pas d'appel supabase direct dans le callback onAuthStateChange : fetchCart()
    // (serverFn) repasse par getSession() pour attacher le Bearer → verrou d'auth
    // potentiellement encore tenu par l'opération qui a émis l'événement → blocage 15 s
    // (incident 4/07/2026). setTimeout 0 diffère la fusion hors du verrou.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
          const uid = session.user.id;
          setTimeout(() => { mergeWithServer(uid); }, 0);
        } else userIdRef.current = session.user.id;
      } else {
        // Déconnexion : on redevient invité (le panier local reste), refusion au prochain login.
        userIdRef.current = null;
        syncedRef.current = false;
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 4) Sauvegarde debouncée vers le serveur quand le panier change (si connecté & fusionné).
  useEffect(() => {
    if (!hydrated || !userIdRef.current || !syncedRef.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      pushCart({ data: { items } }).catch(() => {});
    }, 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [items, hydrated]);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((s, i) => s + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.qty * Number(i.price_usd), 0);
    return {
      items,
      count,
      subtotal,
      add: (item, qty = 1) =>
        setItems((prev) => {
          const existing = prev.find((p) => p.id === item.id);
          if (existing) {
            const newQty = Math.min(existing.stock || 99, existing.qty + qty);
            return prev.map((p) => (p.id === item.id ? { ...p, qty: newQty } : p));
          }
          return [...prev, { ...item, qty: Math.min(item.stock || 99, qty) }];
        }),
      remove: (id) => setItems((prev) => prev.filter((p) => p.id !== id)),
      setQty: (id, qty) =>
        setItems((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, qty: Math.max(1, Math.min(p.stock || 99, qty)) } : p,
          ),
        ),
      clear: () => setItems([]),
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}