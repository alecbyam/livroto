// Prix barré (promotion produit) — logique pure, importable côté serveur
// (calcul du prix réellement facturé) ET côté client (affichage vitrine/POS),
// même principe que src/lib/promo.ts côté marketplace mais sans étape
// d'approbation admin séparée (une boutique gère son propre catalogue).
export type ProduitPrixPromo = {
  prix_usd: number | string;
  prix_promo_usd?: number | string | null;
  promo_actif?: boolean | null;
  promo_debut?: string | null;
  promo_fin?: string | null;
};

export type PrixEffectif = {
  enPromo: boolean;
  prix: number; // prix réellement facturé
  prixOriginal: number; // prix barré si enPromo
  economie: number;
  pourcentage: number;
};

export function getPrixEffectif(p: ProduitPrixPromo): PrixEffectif {
  const original = Number(p.prix_usd) || 0;
  const promo = p.prix_promo_usd != null ? Number(p.prix_promo_usd) : null;
  const now = Date.now();
  const debutOk = !p.promo_debut || new Date(p.promo_debut).getTime() <= now;
  const finOk = !p.promo_fin || new Date(p.promo_fin).getTime() >= now;
  const enPromo = !!p.promo_actif && promo != null && promo > 0 && promo < original && debutOk && finOk;

  const prix = enPromo ? (promo as number) : original;
  const economie = enPromo ? Math.round((original - (promo as number)) * 100) / 100 : 0;
  const pourcentage = enPromo && original > 0 ? Math.round((economie / original) * 100) : 0;
  return { enPromo, prix, prixOriginal: original, economie, pourcentage };
}
