-- ============================================================================
-- LIVROTO — Boutiques : livraison (intégration HM Logistics)
--
-- ATTENTION : le contrat d'API HM Logistics (authentification, forme exacte
-- du webhook de statut, nomenclature des statuts côté transporteur) n'a pas
-- été fourni. Ce schéma est un squelette générique volontairement souple
-- (tracking_url, référence externe, statut normalisé côté Livroto) — à
-- ajuster dès que la documentation/API HM Logistics sera disponible. Voir la
-- note de vigilance transmise séparément.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.livraisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  commande_id uuid NOT NULL UNIQUE REFERENCES public.commandes_ecommerce(id) ON DELETE CASCADE,
  statut_hm_logistics text NOT NULL DEFAULT 'en_attente' CHECK (statut_hm_logistics IN (
    'en_attente', 'prise_en_charge', 'en_transit', 'livree', 'echec', 'retournee'
  )),
  coursier_id text,               -- identifiant coursier côté HM Logistics (pas un uuid Livroto)
  coursier_nom text,
  reference_hm_logistics text,    -- id externe renvoyé par HM Logistics à la création de l'expédition
  date_prise_en_charge timestamptz,
  date_livraison timestamptz,
  tracking_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS livraisons_boutique_idx ON public.livraisons(boutique_id, created_at DESC);
CREATE INDEX IF NOT EXISTS livraisons_reference_idx ON public.livraisons(reference_hm_logistics);

GRANT SELECT, INSERT, UPDATE ON public.livraisons TO authenticated;
GRANT ALL ON public.livraisons TO service_role;
ALTER TABLE public.livraisons ENABLE ROW LEVEL SECURITY;

CREATE POLICY livraisons_staff_all ON public.livraisons
  FOR ALL TO authenticated
  USING (public.is_boutique_staff(boutique_id, NULL))
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur','caissier']::public.boutique_role[]));

-- Un client suit sa propre livraison (statut temps réel).
CREATE POLICY livraisons_client_read ON public.livraisons
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.commandes_ecommerce c
    JOIN public.clients_boutique cb ON cb.id = c.client_id
    WHERE c.id = commande_id AND cb.user_id = (select auth.uid())
  ));

CREATE TRIGGER livraisons_set_updated_at BEFORE UPDATE ON public.livraisons
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Suivi invité (commande sans compte) : passe par un serverFn dédié qui
-- vérifie numero de commande + téléphone via service_role (même logique que
-- le suivi de commande invité déjà utilisé pour le marketplace), jamais par
-- une policy RLS ouverte à anon (un numéro de commande n'est pas un secret,
-- mais on ne veut pas non plus permettre l'énumération de toutes les
-- livraisons d'une boutique).
