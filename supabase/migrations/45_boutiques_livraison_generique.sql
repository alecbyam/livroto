-- ============================================================================
-- LIVROTO — Boutiques : correction — pas de "HM Logistics"
--
-- Hypothèse erronée en migration 37 : un transporteur externe nommé
-- "HM Logistics" avec sa propre API. Correction de l'utilisateur : la
-- livraison est assurée SOIT par JuntoX via le réseau de livreurs Livroto
-- existant (table `riders`), SOIT par la boutique cliente elle-même (son
-- propre livreur/moyen informel) — jamais un prestataire externe tiers.
--
-- On généralise donc le schéma : `statut_hm_logistics` -> `statut_livraison`
-- (les statuts eux-mêmes restent des états de livraison génériques, pas
-- spécifiques à un transporteur), `reference_hm_logistics` supprimée (aucune
-- référence externe n'a de sens ici), ajout de `mode_livraison` (qui assure
-- la livraison) et `rider_id` (livreur Livroto réel, si JuntoX s'en charge).
-- ============================================================================

ALTER TABLE public.livraisons RENAME COLUMN statut_hm_logistics TO statut_livraison;
ALTER TABLE public.livraisons DROP COLUMN reference_hm_logistics;

ALTER TABLE public.livraisons
  ADD COLUMN mode_livraison text NOT NULL DEFAULT 'boutique' CHECK (mode_livraison IN ('juntox_livroto', 'boutique')),
  ADD COLUMN rider_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.livraisons.mode_livraison IS
  'juntox_livroto = livré par un livreur du réseau Livroto existant (rider_id renseigné) ; boutique = la boutique cliente livre elle-même (coursier_nom en texte libre, pas de compte Livroto).';

CREATE INDEX IF NOT EXISTS livraisons_rider_idx ON public.livraisons(rider_id) WHERE rider_id IS NOT NULL;
