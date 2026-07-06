import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type FavCtx = {
  ids: Set<string>;
  ready: boolean;
  add: (productId: string) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<FavCtx | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const loadFor = useCallback(async (uid: string | null) => {
    setUserId(uid);
    if (!uid) { setIds(new Set()); setReady(true); return; }
    const { data } = await supabase.from("favorites").select("product_id").eq("user_id", uid);
    setIds(new Set((data ?? []).map((r) => r.product_id)));
    setReady(true);
  }, []);

  // getSession() (local) et non getUser() (réseau) — règle projet : jamais de réseau
  // pour connaître l'utilisateur courant côté UI.
  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadFor(data.session?.user.id ?? null);
  }, [loadFor]);

  useEffect(() => {
    refresh();
    // ⚠️ Ne JAMAIS appeler supabase (auth OU requête .from) directement dans le callback
    // onAuthStateChange : il peut s'exécuter pendant que le verrou d'auth est tenu, et
    // toute requête repasse par getSession() → même verrou → blocages en chaîne de 15 s
    // (incident du 4/07/2026 : le watchdog prenait cet embouteillage pour un gel et
    // purgeait une session valide). On lit l'uid depuis l'événement et on diffère le
    // travail hors du verrou (setTimeout 0 — motif recommandé par la doc Supabase).
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user.id ?? null;
      setTimeout(() => { loadFor(uid); }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh, loadFor]);

  const add = useCallback(async (productId: string) => {
    if (!userId) { toast.error("Connecte-toi pour enregistrer tes favoris"); return; }
    setIds((s) => new Set(s).add(productId));
    const { error } = await supabase.from("favorites").insert({ user_id: userId, product_id: productId });
    if (error && !`${error.message}`.includes("duplicate")) {
      setIds((s) => { const n = new Set(s); n.delete(productId); return n; });
      toast.error(error.message);
    }
  }, [userId]);

  const remove = useCallback(async (productId: string) => {
    if (!userId) return;
    setIds((s) => { const n = new Set(s); n.delete(productId); return n; });
    const { error } = await supabase.from("favorites").delete().eq("user_id", userId).eq("product_id", productId);
    if (error) {
      setIds((s) => new Set(s).add(productId));
      toast.error(error.message);
    }
  }, [userId]);

  return <Ctx.Provider value={{ ids, ready, add, remove, refresh }}>{children}</Ctx.Provider>;
}

export function useFavorites() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFavorites must be used inside FavoritesProvider");
  return c;
}

export function useFavorite(productId: string) {
  const { ids, add, remove } = useFavorites();
  const isFav = ids.has(productId);
  const toggle = () => (isFav ? remove(productId) : add(productId));
  return { isFav, toggle };
}