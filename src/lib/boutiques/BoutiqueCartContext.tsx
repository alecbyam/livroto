// Panier client-side (localStorage), scopé par boutique_id pour qu'un même
// navigateur visitant deux boutiques clientes différentes n'ait jamais leurs
// paniers mélangés. Choix délibéré : pas de synchronisation serveur via la
// table `panier` (conçue pour ça, RLS service_role-only, cf. migration 36) —
// suffisant pour un MVP mono-appareil ; la synchro multi-appareil est un
// follow-up possible si un client se plaint de perdre son panier en changeant
// de téléphone.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ArticlePanier = { produit_id: string; nom: string; prix_usd: number; quantite: number; image_url?: string | null };

type PanierContexte = {
  articles: ArticlePanier[];
  ajouter: (p: { produit_id: string; nom: string; prix_usd: number; image_url?: string | null }) => void;
  retirer: (produit_id: string) => void;
  changerQuantite: (produit_id: string, quantite: number) => void;
  vider: () => void;
  sousTotal: number;
};

const Ctx = createContext<PanierContexte | null>(null);

export function BoutiqueCartProvider({ boutiqueId, children }: { boutiqueId: string; children: ReactNode }) {
  const key = `livroto.boutique.${boutiqueId}.panier`;
  const [articles, setArticles] = useState<ArticlePanier[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(articles)); } catch {}
  }, [key, articles]);

  const ajouter: PanierContexte["ajouter"] = (p) => {
    setArticles((prev) => {
      const existe = prev.find((a) => a.produit_id === p.produit_id);
      if (existe) return prev.map((a) => (a.produit_id === p.produit_id ? { ...a, quantite: a.quantite + 1 } : a));
      return [...prev, { ...p, quantite: 1 }];
    });
  };
  const retirer = (produit_id: string) => setArticles((prev) => prev.filter((a) => a.produit_id !== produit_id));
  const changerQuantite = (produit_id: string, quantite: number) =>
    setArticles((prev) => prev.map((a) => (a.produit_id === produit_id ? { ...a, quantite: Math.max(1, quantite) } : a)));
  const vider = () => setArticles([]);
  const sousTotal = articles.reduce((s, a) => s + a.prix_usd * a.quantite, 0);

  return (
    <Ctx.Provider value={{ articles, ajouter, retirer, changerQuantite, vider, sousTotal }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBoutiqueCart(): PanierContexte {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBoutiqueCart() doit être utilisé sous <BoutiqueCartProvider>.");
  return ctx;
}
