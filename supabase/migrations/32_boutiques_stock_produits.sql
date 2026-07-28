-- ============================================================================
-- LIVROTO — Boutiques : catalogue produits + stock (mouvements tracés, QR code)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  nom text NOT NULL,
  categorie text NOT NULL DEFAULT 'vetement' CHECK (categorie IN ('vetement', 'accessoire')),
  taille text,
  couleur text,
  prix_usd numeric(10,2) NOT NULL CHECK (prix_usd >= 0),
  quantite integer NOT NULL DEFAULT 0 CHECK (quantite >= 0),
  seuil_alerte integer NOT NULL DEFAULT 3 CHECK (seuil_alerte >= 0),
  qr_code_data text UNIQUE,   -- généré automatiquement : '<boutique_id>:<produit_id>'
  qr_code_url text,          -- image PNG générée côté appli (lib `qrcode`), hébergée sur Supabase Storage
  image_url text,
  description text,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS produits_boutique_idx ON public.produits(boutique_id) WHERE actif;
CREATE INDEX IF NOT EXISTS produits_stock_bas_idx ON public.produits(boutique_id) WHERE quantite <= seuil_alerte;

-- Génère qr_code_data automatiquement : boutique_id:produit_id. Fonctionne
-- car en PostgreSQL, DEFAULT gen_random_uuid() est appliqué à NEW.id AVANT
-- que le trigger BEFORE INSERT ne s'exécute -> NEW.id est déjà disponible ici.
CREATE OR REPLACE FUNCTION public.tg_produits_generer_qr_data()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.qr_code_data IS NULL THEN
    NEW.qr_code_data := NEW.boutique_id::text || ':' || NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_produits_generer_qr_data
  BEFORE INSERT ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.tg_produits_generer_qr_data();

CREATE TRIGGER produits_set_updated_at BEFORE UPDATE ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Garde-fou : `quantite` ne doit JAMAIS être modifiée par un UPDATE direct,
-- uniquement via public.fn_mouvement_stock() qui trace chaque mouvement dans
-- stock_movements. On matérialise cette règle avec un verrou technique (GUC
-- de transaction) plutôt qu'une simple convention de code, pour qu'aucun
-- serverFn futur ne puisse accidentellement casser l'historique.
CREATE OR REPLACE FUNCTION public.tg_produits_garde_quantite()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quantite <> OLD.quantite
     AND current_setting('livroto.allow_stock_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Modification directe de produits.quantite interdite : utiliser public.fn_mouvement_stock()';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_produits_garde_quantite
  BEFORE UPDATE OF quantite ON public.produits
  FOR EACH ROW EXECUTE FUNCTION public.tg_produits_garde_quantite();

GRANT SELECT ON public.produits TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.produits TO authenticated;
GRANT ALL ON public.produits TO service_role;
ALTER TABLE public.produits ENABLE ROW LEVEL SECURITY;

-- Vitrine publique : uniquement les produits actifs de boutiques actives.
CREATE POLICY produits_public_read ON public.produits
  FOR SELECT TO anon, authenticated
  USING (
    actif = true
    AND EXISTS (SELECT 1 FROM public.boutiques b WHERE b.id = boutique_id AND b.actif = true)
  );

CREATE POLICY produits_staff_read ON public.produits
  FOR SELECT TO authenticated USING (public.is_boutique_staff(boutique_id, NULL));

-- Créer/modifier la fiche produit (hors quantite, protégée par le garde-fou
-- ci-dessus) : admin + vendeur. Le caissier n'a qu'un accès caisse (scan +
-- vente), jamais la gestion du catalogue.
CREATE POLICY produits_staff_insert ON public.produits
  FOR INSERT TO authenticated
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]));

CREATE POLICY produits_staff_update ON public.produits
  FOR UPDATE TO authenticated
  USING (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]))
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]));

CREATE POLICY produits_admin_delete ON public.produits
  FOR DELETE TO authenticated
  USING (public.is_boutique_staff(boutique_id, ARRAY['admin']::public.boutique_role[]));

-- ----------------------------------------------------------------------------
-- Mouvements de stock (historique immuable — seule source de vérité sur les
-- variations de quantite. Jamais d'UPDATE/DELETE sur cette table.)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  produit_id uuid NOT NULL REFERENCES public.produits(id) ON DELETE CASCADE,
  type_mouvement text NOT NULL CHECK (type_mouvement IN (
    'entree', 'sortie', 'ajustement', 'vente', 'reception_fournisseur', 'annulation'
  )),
  quantite integer NOT NULL CHECK (quantite <> 0),   -- delta signé (+entrée / -sortie)
  quantite_apres integer NOT NULL CHECK (quantite_apres >= 0),
  reference_type text,     -- 'vente' | 'bon_commande_fournisseur' | 'commande_ecommerce' | ...
  reference_id uuid,
  motif text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_produit_idx ON public.stock_movements(produit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_boutique_idx ON public.stock_movements(boutique_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_reference_idx ON public.stock_movements(reference_type, reference_id);

GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY stock_movements_staff_read ON public.stock_movements
  FOR SELECT TO authenticated USING (public.is_boutique_staff(boutique_id, NULL));
-- Pas de policy INSERT pour authenticated : seule public.fn_mouvement_stock()
-- (SECURITY DEFINER) peut créer un mouvement, ce qui garantit qu'un mouvement
-- existe TOUJOURS en miroir exact de chaque variation de produits.quantite.

-- ----------------------------------------------------------------------------
-- Fonction unique et sécurisée pour toute variation de stock.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_mouvement_stock(
  p_produit_id uuid,
  p_type text,
  p_quantite_delta integer,
  p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,
  p_motif text DEFAULT NULL
)
RETURNS public.stock_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_boutique_id uuid;
  v_quantite_actuelle integer;
  v_nouvelle_quantite integer;
  v_mouvement public.stock_movements;
BEGIN
  SELECT boutique_id, quantite INTO v_boutique_id, v_quantite_actuelle
  FROM public.produits WHERE id = p_produit_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produit % introuvable', p_produit_id;
  END IF;

  -- Autorisé si : (1) l'appelant est staff de CETTE boutique via PostgREST,
  -- (2) l'appel vient d'un serveur de confiance (edge function/serverFn avec
  -- la clé service_role), ou (3) il n'y a aucun contexte JWT du tout — c'est
  -- une connexion SQL directe (migration, SQL editor, Supabase MCP), donc déjà
  -- un accès opérateur de confiance. Sans (3), toute migration/seed qui
  -- déclenche ce chemin (ex: confirmation de commande e-commerce) échouerait
  -- car auth.uid()/auth.role() sont NULL hors requête PostgREST.
  IF NOT (
    public.is_boutique_staff(v_boutique_id, NULL)
    OR auth.role() = 'service_role'
    OR current_setting('request.jwt.claims', true) IS NULL
  ) THEN
    RAISE EXCEPTION 'Non autorisé à modifier le stock de cette boutique';
  END IF;

  v_nouvelle_quantite := v_quantite_actuelle + p_quantite_delta;
  IF v_nouvelle_quantite < 0 THEN
    RAISE EXCEPTION 'Stock insuffisant pour le produit % (stock: %, demandé: %)',
      p_produit_id, v_quantite_actuelle, -p_quantite_delta;
  END IF;

  PERFORM set_config('livroto.allow_stock_write', 'on', true);
  UPDATE public.produits SET quantite = v_nouvelle_quantite, updated_at = now() WHERE id = p_produit_id;
  PERFORM set_config('livroto.allow_stock_write', 'off', true);

  INSERT INTO public.stock_movements (
    boutique_id, produit_id, type_mouvement, quantite, quantite_apres,
    reference_type, reference_id, motif, created_by
  ) VALUES (
    v_boutique_id, p_produit_id, p_type, p_quantite_delta, v_nouvelle_quantite,
    p_reference_type, p_reference_id, p_motif, auth.uid()
  ) RETURNING * INTO v_mouvement;

  RETURN v_mouvement;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_mouvement_stock(uuid, text, integer, text, uuid, text) TO authenticated, service_role;

-- Génération en lot d'étiquettes QR (réception de marchandise) : pas de
-- fonction SQL dédiée nécessaire, un simple SELECT multi-id suffit — la RLS
-- produits_staff_read couvre déjà l'autorisation, la mise en page de la
-- planche d'étiquettes est un détail d'interface (voir Phase "Stock + QR").
