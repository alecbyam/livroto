-- ============================================================================
-- LIVROTO — Boutiques : fournisseurs, bons de commande, réception
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  nom text NOT NULL,
  contact text,
  telephone text,
  adresse text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fournisseurs_boutique_idx ON public.fournisseurs(boutique_id) WHERE actif;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fournisseurs TO authenticated;
GRANT ALL ON public.fournisseurs TO service_role;
ALTER TABLE public.fournisseurs ENABLE ROW LEVEL SECURITY;

CREATE POLICY fournisseurs_staff_read ON public.fournisseurs
  FOR SELECT TO authenticated USING (public.is_boutique_staff(boutique_id, NULL));
CREATE POLICY fournisseurs_staff_insert ON public.fournisseurs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]));
CREATE POLICY fournisseurs_staff_update ON public.fournisseurs
  FOR UPDATE TO authenticated
  USING (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]))
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]));
CREATE POLICY fournisseurs_admin_delete ON public.fournisseurs
  FOR DELETE TO authenticated
  USING (public.is_boutique_staff(boutique_id, ARRAY['admin']::public.boutique_role[]));

CREATE TRIGGER fournisseurs_set_updated_at BEFORE UPDATE ON public.fournisseurs
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bons_commande_fournisseur (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  fournisseur_id uuid NOT NULL REFERENCES public.fournisseurs(id),
  numero text,
  statut text NOT NULL DEFAULT 'brouillon' CHECK (statut IN (
    'brouillon', 'envoye', 'recu_partiel', 'recu_complet', 'annule'
  )),
  date_commande timestamptz,
  date_reception timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bons_commande_boutique_idx ON public.bons_commande_fournisseur(boutique_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bons_commande_fournisseur_idx ON public.bons_commande_fournisseur(fournisseur_id);

GRANT SELECT, INSERT, UPDATE ON public.bons_commande_fournisseur TO authenticated;
GRANT ALL ON public.bons_commande_fournisseur TO service_role;
ALTER TABLE public.bons_commande_fournisseur ENABLE ROW LEVEL SECURITY;

CREATE POLICY bons_commande_staff_read ON public.bons_commande_fournisseur
  FOR SELECT TO authenticated USING (public.is_boutique_staff(boutique_id, NULL));
CREATE POLICY bons_commande_staff_insert ON public.bons_commande_fournisseur
  FOR INSERT TO authenticated
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]));
CREATE POLICY bons_commande_staff_update ON public.bons_commande_fournisseur
  FOR UPDATE TO authenticated
  USING (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]))
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]));

CREATE TRIGGER bons_commande_set_updated_at BEFORE UPDATE ON public.bons_commande_fournisseur
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_bons_commande_numeroter()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := 'BC-' || lpad(public.fn_prochain_numero(NEW.boutique_id, 'bon_commande')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_bons_commande_numeroter BEFORE INSERT ON public.bons_commande_fournisseur
  FOR EACH ROW EXECUTE FUNCTION public.tg_bons_commande_numeroter();

CREATE TABLE IF NOT EXISTS public.bon_commande_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bon_commande_id uuid NOT NULL REFERENCES public.bons_commande_fournisseur(id) ON DELETE CASCADE,
  produit_id uuid REFERENCES public.produits(id),   -- NULL si nouveau produit pas encore créé au catalogue
  nom_produit text,                                  -- utilisé si produit_id IS NULL (nouveau produit)
  quantite_commandee integer NOT NULL CHECK (quantite_commandee > 0),
  quantite_recue integer NOT NULL DEFAULT 0 CHECK (quantite_recue >= 0),
  prix_achat_unitaire_usd numeric(10,2) NOT NULL CHECK (prix_achat_unitaire_usd >= 0),
  CHECK (produit_id IS NOT NULL OR nom_produit IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS bon_commande_lignes_bc_idx ON public.bon_commande_lignes(bon_commande_id);

GRANT SELECT, INSERT, UPDATE ON public.bon_commande_lignes TO authenticated;
GRANT ALL ON public.bon_commande_lignes TO service_role;
ALTER TABLE public.bon_commande_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY bon_commande_lignes_staff_read ON public.bon_commande_lignes
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.bons_commande_fournisseur bc
      WHERE bc.id = bon_commande_id AND public.is_boutique_staff(bc.boutique_id, NULL)
    )
  );
CREATE POLICY bon_commande_lignes_staff_write ON public.bon_commande_lignes
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bons_commande_fournisseur bc
      WHERE bc.id = bon_commande_id
        AND public.is_boutique_staff(bc.boutique_id, ARRAY['admin','vendeur']::public.boutique_role[])
    )
  );
CREATE POLICY bon_commande_lignes_staff_update ON public.bon_commande_lignes
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.bons_commande_fournisseur bc
      WHERE bc.id = bon_commande_id
        AND public.is_boutique_staff(bc.boutique_id, ARRAY['admin','vendeur']::public.boutique_role[])
    )
  );

-- ----------------------------------------------------------------------------
-- Réception de marchandise : alimente le stock via fn_mouvement_stock, crée
-- le produit + son QR code s'il s'agit d'une référence encore inconnue, et
-- met à jour le statut du bon de commande (partiel/complet). SECURITY
-- DEFINER + vérification interne du rôle -> peut être appelée directement par
-- un serverFn authentifié, sans policy INSERT séparée sur stock_movements.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_receptionner_ligne(
  p_ligne_id uuid,
  p_quantite_recue integer,
  p_prix_vente_usd numeric DEFAULT NULL   -- prix de vente si nouveau produit
)
RETURNS public.bon_commande_lignes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ligne public.bon_commande_lignes;
  v_bc public.bons_commande_fournisseur;
  v_produit_id uuid;
  v_total_lignes integer;
  v_lignes_completes integer;
BEGIN
  SELECT * INTO v_ligne FROM public.bon_commande_lignes WHERE id = p_ligne_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ligne de bon de commande % introuvable', p_ligne_id; END IF;

  SELECT * INTO v_bc FROM public.bons_commande_fournisseur WHERE id = v_ligne.bon_commande_id;

  -- Cf. commentaire équivalent dans fn_mouvement_stock (migration 32) :
  -- l'absence totale de contexte JWT (connexion SQL directe / migration)
  -- est traitée comme un accès opérateur de confiance.
  IF NOT (
    public.is_boutique_staff(v_bc.boutique_id, ARRAY['admin','vendeur']::public.boutique_role[])
    OR current_setting('request.jwt.claims', true) IS NULL
  ) THEN
    RAISE EXCEPTION 'Non autorisé à réceptionner ce bon de commande';
  END IF;

  v_produit_id := v_ligne.produit_id;

  -- Nouveau produit (pas encore au catalogue) : on le crée à la volée, ce qui
  -- déclenche automatiquement la génération de son qr_code_data (trigger de
  -- la migration 32). Le prix de vente doit être fourni par l'appelant (le
  -- prix d'achat seul ne suffit pas à fixer un prix de vente).
  IF v_produit_id IS NULL THEN
    IF p_prix_vente_usd IS NULL THEN
      RAISE EXCEPTION 'prix_vente_usd requis pour créer le nouveau produit "%"', v_ligne.nom_produit;
    END IF;
    INSERT INTO public.produits (boutique_id, nom, prix_usd, quantite)
    VALUES (v_bc.boutique_id, v_ligne.nom_produit, p_prix_vente_usd, 0)
    RETURNING id INTO v_produit_id;

    UPDATE public.bon_commande_lignes SET produit_id = v_produit_id WHERE id = p_ligne_id;
  END IF;

  PERFORM public.fn_mouvement_stock(
    v_produit_id, 'reception_fournisseur', p_quantite_recue,
    'bon_commande_fournisseur', v_bc.id,
    'Réception BC ' || COALESCE(v_bc.numero, v_bc.id::text)
  );

  UPDATE public.bon_commande_lignes
  SET quantite_recue = quantite_recue + p_quantite_recue, produit_id = v_produit_id
  WHERE id = p_ligne_id
  RETURNING * INTO v_ligne;

  -- Statut du bon de commande : complet si toutes les lignes sont totalement
  -- reçues, partiel dès qu'au moins une réception a eu lieu.
  SELECT count(*), count(*) FILTER (WHERE quantite_recue >= quantite_commandee)
  INTO v_total_lignes, v_lignes_completes
  FROM public.bon_commande_lignes WHERE bon_commande_id = v_bc.id;

  UPDATE public.bons_commande_fournisseur
  SET statut = CASE WHEN v_lignes_completes = v_total_lignes THEN 'recu_complet' ELSE 'recu_partiel' END,
      date_reception = now()
  WHERE id = v_bc.id;

  RETURN v_ligne;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_receptionner_ligne(uuid, integer, numeric) TO authenticated, service_role;
