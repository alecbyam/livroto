/**
 * Logique de prix promotionnel (prix barré). price_usd = prix ORIGINAL.
 * Une promo est LIVE seulement si : activée par le vendeur + validée par l'admin
 * + dans la fenêtre de dates + prix promo valide et inférieur à l'original.
 */
export type PromoFields = {
  price_usd: number | string;
  promo_price_usd?: number | string | null;
  promo_active?: boolean | null;
  promo_approved?: boolean | null;
  promo_starts_at?: string | null;
  promo_ends_at?: string | null;
};

export type PromoInfo = {
  active: boolean;
  price: number;     // prix effectif (à payer)
  original: number;  // prix original (barré si promo)
  saving: number;    // montant économisé
  percent: number;   // % de réduction
};

export function getPromo(p: PromoFields): PromoInfo {
  const original = Number(p.price_usd) || 0;
  const promo = p.promo_price_usd != null ? Number(p.promo_price_usd) : null;
  const now = Date.now();
  const startOk = !p.promo_starts_at || new Date(p.promo_starts_at).getTime() <= now;
  const endOk = !p.promo_ends_at || new Date(p.promo_ends_at).getTime() >= now;
  const active =
    !!p.promo_active &&
    !!p.promo_approved &&
    promo != null &&
    promo > 0 &&
    promo < original &&
    startOk &&
    endOk;

  const price = active ? (promo as number) : original;
  const saving = active ? original - (promo as number) : 0;
  const percent = active && original > 0 ? Math.round((saving / original) * 100) : 0;
  return { active, price, original, saving, percent };
}
