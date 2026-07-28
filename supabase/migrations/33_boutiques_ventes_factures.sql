-- ============================================================================
-- LIVROTO — Boutiques : ventes (POS + e-commerce unifiés), lignes, factures
--
-- Toute vente — qu'elle vienne de la caisse physique (scan QR) ou d'une
-- commande e-commerce confirmée (cf. migration 36) — passe par CETTE table.
-- C'est ce qui garantit qu'il n'existe qu'UN SEUL pipeline de décrément de
-- stock (trigger sur vente_lignes ci-dessous -> fn_mouvement_stock), qu'un
-- seul système de numérotation de facture, et qu'un seul endroit pour
-- calculer le CA magasin physique vs en ligne (colonne `canal`).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ventes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  numero text,                          -- attribué par trigger, ex: 'V-000123'
  canal text NOT NULL DEFAULT 'pos' CHECK (canal IN ('pos', 'ecommerce')),
  client_id uuid REFERENCES public.clients_boutique(id) ON DELETE SET NULL,
  caissier_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mode_paiement text NOT NULL CHECK (mode_paiement IN ('cash', 'mobile_money', 'carte', 'paiement_livraison')),
  sous_total_usd numeric(10,2) NOT NULL DEFAULT 0 CHECK (sous_total_usd >= 0),
  code_promo_id uuid,   -- FK ajoutée en migration 35 (codes_promo n'existe pas encore ici)
  remise_usd numeric(10,2) NOT NULL DEFAULT 0 CHECK (remise_usd >= 0),
  total_usd numeric(10,2) NOT NULL CHECK (total_usd >= 0),
  statut text NOT NULL DEFAULT 'validee' CHECK (statut IN ('en_attente_sync', 'validee', 'annulee')),
  hors_ligne_id text,   -- UUID généré côté client (file d'attente offline) : dédoublonnage à la synchro
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ventes_hors_ligne_uniq
  ON public.ventes(boutique_id, hors_ligne_id) WHERE hors_ligne_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ventes_boutique_idx ON public.ventes(boutique_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ventes_canal_idx ON public.ventes(boutique_id, canal);

GRANT SELECT, INSERT, UPDATE ON public.ventes TO authenticated;
GRANT ALL ON public.ventes TO service_role;
ALTER TABLE public.ventes ENABLE ROW LEVEL SECURITY;

CREATE POLICY ventes_staff_read ON public.ventes
  FOR SELECT TO authenticated USING (public.is_boutique_staff(boutique_id, NULL));

-- Encaisser une vente : les 3 rôles peuvent vendre en caisse (admin, vendeur,
-- caissier) — c'est le coeur du métier caissier.
CREATE POLICY ventes_staff_insert ON public.ventes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur','caissier']::public.boutique_role[]));

-- Annuler une vente : admin + vendeur seulement (pas le caissier, pour éviter
-- qu'une caisse compromise/complice annule des ventes pour couvrir un vol).
CREATE POLICY ventes_staff_update ON public.ventes
  FOR UPDATE TO authenticated
  USING (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]))
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]));

-- Un client voit ses propres ventes (historique d'achat / reçu).
CREATE POLICY ventes_client_read ON public.ventes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clients_boutique cb
    WHERE cb.id = client_id AND cb.user_id = (select auth.uid())
  ));

CREATE TABLE IF NOT EXISTS public.vente_lignes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vente_id uuid NOT NULL REFERENCES public.ventes(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id),
  quantite integer NOT NULL CHECK (quantite > 0),
  prix_unitaire_usd numeric(10,2) NOT NULL CHECK (prix_unitaire_usd >= 0),
  total_ligne_usd numeric(10,2) NOT NULL CHECK (total_ligne_usd >= 0)
);

CREATE INDEX IF NOT EXISTS vente_lignes_vente_idx ON public.vente_lignes(vente_id);
CREATE INDEX IF NOT EXISTS vente_lignes_produit_idx ON public.vente_lignes(produit_id);

GRANT SELECT, INSERT ON public.vente_lignes TO authenticated;
GRANT ALL ON public.vente_lignes TO service_role;
ALTER TABLE public.vente_lignes ENABLE ROW LEVEL SECURITY;

CREATE POLICY vente_lignes_staff_read ON public.vente_lignes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ventes v WHERE v.id = vente_id AND public.is_boutique_staff(v.boutique_id, NULL))
  );
CREATE POLICY vente_lignes_staff_insert ON public.vente_lignes
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ventes v WHERE v.id = vente_id
        AND public.is_boutique_staff(v.boutique_id, ARRAY['admin','vendeur','caissier']::public.boutique_role[])
    )
  );

-- Numérotation séquentielle de la vente à la création.
CREATE OR REPLACE FUNCTION public.tg_ventes_numeroter()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := 'V-' || lpad(public.fn_prochain_numero(NEW.boutique_id, 'vente')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_ventes_numeroter BEFORE INSERT ON public.ventes
  FOR EACH ROW EXECUTE FUNCTION public.tg_ventes_numeroter();

-- Décrément automatique du stock : à chaque ligne de vente insérée, on trace
-- le mouvement ET on décrémente produits.quantite via l'unique fonction
-- sanctionnée. Fonctionne pour TOUTE vente (POS ou e-commerce) puisque les
-- commandes e-commerce confirmées créent aussi des vente_lignes (migration
-- 36) -> stock réellement partagé entre les deux canaux, un seul chemin de
-- code, aucun risque de désynchronisation entre POS et boutique en ligne.
CREATE OR REPLACE FUNCTION public.tg_vente_lignes_decrement_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.fn_mouvement_stock(
    NEW.produit_id, 'vente', -NEW.quantite, 'vente', NEW.vente_id, NULL
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_vente_lignes_decrement_stock AFTER INSERT ON public.vente_lignes
  FOR EACH ROW EXECUTE FUNCTION public.tg_vente_lignes_decrement_stock();

-- ----------------------------------------------------------------------------
-- Factures : un PDF + une numérotation séquentielle par boutique_id.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.factures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  vente_id uuid NOT NULL UNIQUE REFERENCES public.ventes(id) ON DELETE CASCADE,
  numero text,                 -- attribué par trigger, ex: 'F-000045'
  pdf_url text,                -- rempli après génération (Supabase Storage)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS factures_boutique_idx ON public.factures(boutique_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.factures TO authenticated;
GRANT ALL ON public.factures TO service_role;
ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;

CREATE POLICY factures_staff_all ON public.factures
  FOR ALL TO authenticated
  USING (public.is_boutique_staff(boutique_id, NULL))
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur','caissier']::public.boutique_role[]));

CREATE POLICY factures_client_read ON public.factures
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ventes v
    JOIN public.clients_boutique cb ON cb.id = v.client_id
    WHERE v.id = vente_id AND cb.user_id = (select auth.uid())
  ));

CREATE OR REPLACE FUNCTION public.tg_factures_numeroter()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := 'F-' || lpad(public.fn_prochain_numero(NEW.boutique_id, 'facture')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_factures_numeroter BEFORE INSERT ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.tg_factures_numeroter();

-- Une facture est générée automatiquement pour CHAQUE vente validée — le
-- pdf_url reste NULL jusqu'à ce que le serverFn de rendu PDF le remplisse
-- (génération asynchrone, ne bloque jamais l'encaissement).
CREATE OR REPLACE FUNCTION public.tg_ventes_generer_facture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.statut = 'validee' THEN
    INSERT INTO public.factures (boutique_id, vente_id)
    VALUES (NEW.boutique_id, NEW.id)
    ON CONFLICT (vente_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_ventes_generer_facture AFTER INSERT ON public.ventes
  FOR EACH ROW EXECUTE FUNCTION public.tg_ventes_generer_facture();
