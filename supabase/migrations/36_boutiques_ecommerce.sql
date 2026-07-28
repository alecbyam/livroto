-- ============================================================================
-- LIVROTO — Boutiques : e-commerce (commandes, lignes, panier), stock partagé
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.commandes_ecommerce (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients_boutique(id),
  numero text,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN (
    'en_attente', 'confirmee', 'expediee', 'livree', 'annulee'
  )),
  adresse_livraison text NOT NULL,
  mode_paiement text NOT NULL CHECK (mode_paiement IN ('mobile_money', 'paiement_livraison')),
  code_promo_id uuid REFERENCES public.codes_promo(id),
  sous_total_usd numeric(10,2) NOT NULL CHECK (sous_total_usd >= 0),
  remise_usd numeric(10,2) NOT NULL DEFAULT 0,
  frais_livraison_usd numeric(10,2) NOT NULL DEFAULT 0,
  total_usd numeric(10,2) NOT NULL CHECK (total_usd >= 0),
  vente_id uuid REFERENCES public.ventes(id),  -- rempli à la confirmation (cf. trigger plus bas)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commandes_ecommerce_boutique_idx ON public.commandes_ecommerce(boutique_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commandes_ecommerce_client_idx ON public.commandes_ecommerce(client_id);

GRANT SELECT, INSERT, UPDATE ON public.commandes_ecommerce TO anon, authenticated;
GRANT ALL ON public.commandes_ecommerce TO service_role;
ALTER TABLE public.commandes_ecommerce ENABLE ROW LEVEL SECURITY;

CREATE POLICY commandes_ecommerce_staff_all ON public.commandes_ecommerce
  FOR ALL TO authenticated
  USING (public.is_boutique_staff(boutique_id, NULL))
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur','caissier']::public.boutique_role[]));

CREATE POLICY commandes_ecommerce_client_read ON public.commandes_ecommerce
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients_boutique cb WHERE cb.id = client_id AND cb.user_id = (select auth.uid())
  ));

-- Checkout invité ou connecté : création autorisée pour anon/authenticated.
-- La cohérence métier (client_id appartient bien à la boutique, montants
-- corrects, code promo valide) est vérifiée côté serverFn AVANT insertion —
-- RLS garantit ici seulement l'isolation entre boutiques, pas la validité
-- métier de la commande (comme orders_anyone_insert dans le marketplace
-- existant, pour le paiement à la livraison sans compte).
CREATE POLICY commandes_ecommerce_anyone_insert ON public.commandes_ecommerce
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TRIGGER commandes_ecommerce_set_updated_at BEFORE UPDATE ON public.commandes_ecommerce
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_commandes_ecommerce_numeroter()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := 'CMD-' || lpad(public.fn_prochain_numero(NEW.boutique_id, 'commande')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_commandes_ecommerce_numeroter BEFORE INSERT ON public.commandes_ecommerce
  FOR EACH ROW EXECUTE FUNCTION public.tg_commandes_ecommerce_numeroter();

CREATE TABLE IF NOT EXISTS public.commande_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES public.commandes_ecommerce(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id),
  quantite integer NOT NULL CHECK (quantite > 0),
  prix_unitaire_usd numeric(10,2) NOT NULL CHECK (prix_unitaire_usd >= 0),
  total_ligne_usd numeric(10,2) NOT NULL CHECK (total_ligne_usd >= 0)
);

CREATE INDEX IF NOT EXISTS commande_lignes_commande_idx ON public.commande_lignes(commande_id);

GRANT SELECT, INSERT ON public.commande_lignes TO anon, authenticated;
GRANT ALL ON public.commande_lignes TO service_role;
ALTER TABLE public.commande_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY commande_lignes_staff_read ON public.commande_lignes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.commandes_ecommerce c WHERE c.id = commande_id AND public.is_boutique_staff(c.boutique_id, NULL))
  );
CREATE POLICY commande_lignes_client_read ON public.commande_lignes
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.commandes_ecommerce c
      JOIN public.clients_boutique cb ON cb.id = c.client_id
      WHERE c.id = commande_id AND cb.user_id = (select auth.uid())
    )
  );
CREATE POLICY commande_lignes_anyone_insert ON public.commande_lignes
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Stock partagé : dès qu'une commande e-commerce quitte 'en_attente' (staff
-- confirme le paiement), on matérialise une vente miroir (canal='ecommerce')
-- dont les vente_lignes déclenchent le MEME décrément de stock que le POS
-- (trigger migration 33). En cas d'annulation après confirmation, on restaure
-- le stock. Ce trigger est la SEULE façon dont une commande e-commerce touche
-- le stock : aucun autre code ne doit appeler fn_mouvement_stock pour ce
-- canal, sous peine de double comptage.
--
-- Choix : le stock est décrémenté à la CONFIRMATION (pas à la création de la
-- commande 'en_attente'). C'est le même choix que le marketplace existant
-- (tg_orders_adjust_stock) : une commande non confirmée n'immobilise pas de
-- stock. Risque connu à surveiller : deux clients peuvent commander la même
-- dernière pièce avant que l'un des deux ne soit confirmé (survente possible
-- entre 'en_attente' et 'confirmee') — cf. note de vigilance transmise
-- séparément.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_commandes_ecommerce_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ancien_consomme boolean;
  v_nouveau_consomme boolean;
  v_vente_id uuid;
  ligne RECORD;
BEGIN
  v_ancien_consomme := COALESCE(OLD.statut, 'en_attente') NOT IN ('en_attente', 'annulee');
  v_nouveau_consomme := COALESCE(NEW.statut, 'en_attente') NOT IN ('en_attente', 'annulee');

  IF v_ancien_consomme = v_nouveau_consomme THEN
    RETURN NEW;
  END IF;

  IF v_nouveau_consomme AND NOT v_ancien_consomme THEN
    INSERT INTO public.ventes (
      boutique_id, canal, client_id, mode_paiement,
      sous_total_usd, code_promo_id, remise_usd, total_usd, statut
    ) VALUES (
      NEW.boutique_id, 'ecommerce', NEW.client_id, NEW.mode_paiement,
      NEW.sous_total_usd, NEW.code_promo_id, NEW.remise_usd, NEW.total_usd, 'validee'
    ) RETURNING id INTO v_vente_id;

    INSERT INTO public.vente_lignes (vente_id, produit_id, quantite, prix_unitaire_usd, total_ligne_usd)
    SELECT v_vente_id, produit_id, quantite, prix_unitaire_usd, total_ligne_usd
    FROM public.commande_lignes WHERE commande_id = NEW.id;

    NEW.vente_id := v_vente_id;

    IF NEW.code_promo_id IS NOT NULL THEN
      PERFORM public.fn_incrementer_usage_code_promo(NEW.code_promo_id);
    END IF;

  ELSIF v_ancien_consomme AND NOT v_nouveau_consomme THEN
    -- Annulation après confirmation : restaurer le stock. La vente/facture
    -- déjà émise reste en archive (comptabilité) — on ne supprime jamais un
    -- mouvement historique, on ajoute un mouvement inverse.
    FOR ligne IN SELECT produit_id, quantite FROM public.commande_lignes WHERE commande_id = NEW.id
    LOOP
      PERFORM public.fn_mouvement_stock(
        ligne.produit_id, 'annulation', ligne.quantite,
        'commande_ecommerce', NEW.id, 'Annulation commande ' || NEW.numero
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_commandes_ecommerce_stock
  BEFORE UPDATE OF statut ON public.commandes_ecommerce
  FOR EACH ROW EXECUTE FUNCTION public.tg_commandes_ecommerce_stock();

-- ----------------------------------------------------------------------------
-- Panier (session anonyme OU client connecté)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.panier (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  session_id text,      -- panier anonyme (identifiant opaque généré serveur, stocké côté client)
  client_id uuid REFERENCES public.clients_boutique(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  quantite integer NOT NULL CHECK (quantite > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (session_id IS NOT NULL OR client_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS panier_session_produit_uniq
  ON public.panier(boutique_id, session_id, produit_id) WHERE session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS panier_client_produit_uniq
  ON public.panier(boutique_id, client_id, produit_id) WHERE client_id IS NOT NULL;

ALTER TABLE public.panier ENABLE ROW LEVEL SECURITY;
-- RLS activé SANS policy pour anon/authenticated : un panier invité est
-- identifié par un session_id opaque, PAS par un auth.uid() -> RLS ne peut
-- pas vérifier "c'est le mien" pour un visiteur non connecté. Plutôt que
-- d'exposer une table lisible par un session_id potentiellement devinable,
-- TOUT accès au panier passe par des serverFn (service_role côté serveur),
-- qui appliquent elles-mêmes la vérification session_id/client_id. Même
-- principe que public.integration_settings (migration 26).
GRANT ALL ON public.panier TO service_role;

CREATE TRIGGER panier_set_updated_at BEFORE UPDATE ON public.panier
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
