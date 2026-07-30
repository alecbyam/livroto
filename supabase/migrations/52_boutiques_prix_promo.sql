-- Prix barré (promotion produit) pour le module boutiques. Nommé
-- `prix_promo_usd`/`promo_actif`/`promo_debut`/`promo_fin` — délibérément PAS
-- `promo_price_usd`/`promo_active`/`promo_starts_at`/`promo_ends_at` comme
-- côté marketplace (src/lib/promo.ts) : ce module a déjà un concept "promo"
-- différent (`codes_promo`, coupons de réduction au panier, fn_valider_code_promo)
-- — préfixer par "prix_" lève l'ambiguïté entre les deux features.
--
-- Contrairement au marketplace (vendeur tiers + validation admin obligatoire
-- via `promo_approved`), une boutique gère son propre catalogue : pas de
-- couche d'approbation séparée ici, admin ET vendeur peuvent activer une
-- promo directement (même droit que la modification du prix normal).
alter table public.produits
  add column prix_promo_usd numeric check (prix_promo_usd is null or prix_promo_usd >= 0),
  add column promo_debut timestamptz,
  add column promo_fin timestamptz,
  add column promo_actif boolean not null default false;
