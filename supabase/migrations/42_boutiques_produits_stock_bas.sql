-- ============================================================================
-- LIVROTO — Boutiques : colonne générée stock_bas
--
-- PostgREST ne sait comparer une colonne qu'à une valeur littérale, jamais à
-- une autre colonne (impossible d'écrire un filtre "quantite <= seuil_alerte"
-- via l'API REST). On matérialise donc la comparaison en colonne générée,
-- filtrable normalement (`?stock_bas=eq.true`) depuis le serverFn de listing.
-- ============================================================================

ALTER TABLE public.produits
  ADD COLUMN stock_bas boolean GENERATED ALWAYS AS (quantite <= seuil_alerte) STORED;

DROP INDEX IF EXISTS public.produits_stock_bas_idx;
CREATE INDEX produits_stock_bas_idx ON public.produits(boutique_id) WHERE stock_bas;
