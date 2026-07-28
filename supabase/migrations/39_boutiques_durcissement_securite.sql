-- ============================================================================
-- LIVROTO — Boutiques : durcissement suite au linter Supabase (get_advisors)
--
-- Corrige 3 lacunes réelles trouvées après application des migrations 31-38 :
--
-- 1) fn_prochain_numero() n'avait AUCUNE vérification d'autorisation : un
--    appel RPC anonyme direct (POST /rest/v1/rpc/fn_prochain_numero) pouvait
--    consommer des numéros de vente/facture/commande/BC de N'IMPORTE QUELLE
--    boutique, créant des trous dans une numérotation censée être séquentielle
--    (problème potentiellement légal pour la numérotation de factures RDC).
--
-- 2) fn_incrementer_usage_code_promo() n'avait aucune vérification NI de
--    portée : son unique paramètre (code_promo_id) est renvoyé tel quel par
--    fn_valider_code_promo() (donc visible côté client) et n'importe qui
--    pouvait rappeler la fonction en boucle pour épuiser usage_max et
--    désactiver un code promo pour tout le monde. Elle ne doit être appelée
--    QUE par le trigger interne (tg_commandes_ecommerce_stock) -> restreinte
--    à service_role uniquement (un SECURITY DEFINER appelé depuis un autre
--    SECURITY DEFINER s'exécute avec les privilèges du propriétaire de la
--    fonction, pas de l'appelant d'origine : retirer authenticated/anon ne
--    casse donc pas le trigger).
--
-- 3) Plusieurs fonctions trigger (search_path non fixé) : risque de
--    détournement de recherche de schéma. On fixe SET search_path = public
--    partout, comme le reste des fonctions du projet.
--
-- Le linter signale aussi des "policies permissives multiples" (staff_read +
-- client_read + public_read séparées sur la même table/action) : c'est un
-- choix délibéré de lisibilité (chaque policy documente une seule règle
-- métier), l'impact perf est marginal à l'échelle d'une boutique — pas
-- fusionné.
-- ============================================================================

-- 1) fn_prochain_numero : ajout de la vérification d'autorisation ------------
CREATE OR REPLACE FUNCTION public.fn_prochain_numero(p_boutique_id uuid, p_compteur text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero integer;
BEGIN
  IF NOT (
    public.is_boutique_staff(p_boutique_id, NULL)
    OR auth.role() = 'service_role'
    OR current_setting('request.jwt.claims', true) IS NULL
  ) THEN
    RAISE EXCEPTION 'Non autorisé à générer un numéro pour cette boutique';
  END IF;

  INSERT INTO public.boutique_compteurs (boutique_id) VALUES (p_boutique_id)
  ON CONFLICT (boutique_id) DO NOTHING;

  IF p_compteur = 'vente' THEN
    UPDATE public.boutique_compteurs SET prochain_numero_vente = prochain_numero_vente + 1
      WHERE boutique_id = p_boutique_id RETURNING prochain_numero_vente - 1 INTO v_numero;
  ELSIF p_compteur = 'facture' THEN
    UPDATE public.boutique_compteurs SET prochain_numero_facture = prochain_numero_facture + 1
      WHERE boutique_id = p_boutique_id RETURNING prochain_numero_facture - 1 INTO v_numero;
  ELSIF p_compteur = 'commande' THEN
    UPDATE public.boutique_compteurs SET prochain_numero_commande = prochain_numero_commande + 1
      WHERE boutique_id = p_boutique_id RETURNING prochain_numero_commande - 1 INTO v_numero;
  ELSIF p_compteur = 'bon_commande' THEN
    UPDATE public.boutique_compteurs SET prochain_numero_bon_commande = prochain_numero_bon_commande + 1
      WHERE boutique_id = p_boutique_id RETURNING prochain_numero_bon_commande - 1 INTO v_numero;
  ELSE
    RAISE EXCEPTION 'Compteur inconnu: %', p_compteur;
  END IF;

  RETURN v_numero;
END;
$$;

-- 2) fn_incrementer_usage_code_promo : restreinte à service_role -------------
REVOKE EXECUTE ON FUNCTION public.fn_incrementer_usage_code_promo(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_incrementer_usage_code_promo(uuid) TO service_role;

-- 3) Retrait du EXECUTE par défaut à PUBLIC sur les fonctions boutique -------
-- (CREATE FUNCTION accorde EXECUTE à PUBLIC par défaut en PostgreSQL, même
-- sans GRANT explicite -> il faut le retirer puis ré-accorder explicitement.)
REVOKE EXECUTE ON FUNCTION public.is_boutique_staff(uuid, public.boutique_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_boutique_staff(uuid, public.boutique_role[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_mouvement_stock(uuid, text, integer, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_mouvement_stock(uuid, text, integer, text, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_receptionner_ligne(uuid, integer, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_receptionner_ligne(uuid, integer, numeric) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_prochain_numero(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_prochain_numero(uuid, text) TO authenticated, service_role;

-- fn_valider_code_promo reste volontairement accessible à anon (validation
-- d'un code au checkout sans compte) : pas de changement.

-- 4) search_path manquant sur les fonctions trigger --------------------------
CREATE OR REPLACE FUNCTION public.tg_produits_generer_qr_data()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.qr_code_data IS NULL THEN
    NEW.qr_code_data := NEW.boutique_id::text || ':' || NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_produits_garde_quantite()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.quantite <> OLD.quantite
     AND current_setting('livroto.allow_stock_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Modification directe de produits.quantite interdite : utiliser public.fn_mouvement_stock()';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_ventes_numeroter()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := 'V-' || lpad(public.fn_prochain_numero(NEW.boutique_id, 'vente')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_factures_numeroter()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := 'F-' || lpad(public.fn_prochain_numero(NEW.boutique_id, 'facture')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_bons_commande_numeroter()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := 'BC-' || lpad(public.fn_prochain_numero(NEW.boutique_id, 'bon_commande')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_codes_promo_normaliser()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.code := upper(trim(NEW.code));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_commandes_ecommerce_numeroter()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := 'CMD-' || lpad(public.fn_prochain_numero(NEW.boutique_id, 'commande')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- 5) Index couvrants manquants sur les FK (même remédiation que la migration
--    24_fk_covering_indexes.sql pour le reste du projet) --------------------
CREATE INDEX IF NOT EXISTS bon_commande_lignes_produit_idx ON public.bon_commande_lignes(produit_id);
CREATE INDEX IF NOT EXISTS bons_commande_fournisseur_created_by_idx ON public.bons_commande_fournisseur(created_by);
CREATE INDEX IF NOT EXISTS clients_boutique_user_idx ON public.clients_boutique(user_id);
CREATE INDEX IF NOT EXISTS commande_lignes_produit_idx ON public.commande_lignes(produit_id);
CREATE INDEX IF NOT EXISTS commandes_ecommerce_code_promo_idx ON public.commandes_ecommerce(code_promo_id);
CREATE INDEX IF NOT EXISTS commandes_ecommerce_vente_idx ON public.commandes_ecommerce(vente_id);
CREATE INDEX IF NOT EXISTS panier_client_idx ON public.panier(client_id);
CREATE INDEX IF NOT EXISTS panier_produit_idx ON public.panier(produit_id);
CREATE INDEX IF NOT EXISTS ventes_caissier_idx ON public.ventes(caissier_id);
CREATE INDEX IF NOT EXISTS ventes_client_idx ON public.ventes(client_id);
CREATE INDEX IF NOT EXISTS ventes_code_promo_idx ON public.ventes(code_promo_id);
