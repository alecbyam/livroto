// Colonnes Supabase partagées pour les requêtes `products`.
// Une seule source de vérité pour éviter que catalog/index/product/vendor
// divergent silencieusement quand un champ produit est ajouté ou retiré.

const PRODUCT_CORE_FIELDS =
  "id,name,description,price_usd,stock,emoji,image_url,vendor_id,rating_avg,rating_count,promo_price_usd,promo_active,promo_approved,promo_starts_at,promo_ends_at";

/** Listes produits sans filtre de catégorie (accueil, produits liés). */
export const PRODUCT_LIST_SELECT = PRODUCT_CORE_FIELDS;

/** Catalogue avec filtre par catégorie/sous-catégorie. */
export const PRODUCT_CATALOG_SELECT = `${PRODUCT_CORE_FIELDS},category,subcategory_id`;

/** Fiche produit détaillée (inclut la galerie d'images). */
export const PRODUCT_DETAIL_SELECT =
  "id,name,description,price_usd,emoji,image_url,images,vendor_id,stock,category,subcategory_id,rating_avg,rating_count,promo_price_usd,promo_active,promo_approved,promo_starts_at,promo_ends_at";
