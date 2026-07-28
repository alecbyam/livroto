-- ============================================================================
-- LIVROTO — Boutiques : correctif migration 39 incomplet
--
-- REVOKE ... FROM PUBLIC ne retire PAS l'accès du rôle `anon` : ce projet a
-- (comme tout projet Supabase) des privilèges par défaut qui accordent
-- EXECUTE à anon/authenticated/service_role sur CHAQUE fonction créée dans le
-- schéma public, indépendamment du pseudo-rôle PUBLIC. Vérifié après coup via
-- information_schema.routine_privileges : `anon` avait toujours EXECUTE sur
-- fn_incrementer_usage_code_promo malgré la migration 39 -> le contournement
-- (épuiser usage_max d'un code promo via son code_promo_id, exposé par
-- fn_valider_code_promo) restait ouvert. Il faut révoquer EXPLICITEMENT
-- `FROM anon` (et `authenticated` où non désiré), pas seulement `FROM PUBLIC`.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_incrementer_usage_code_promo(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_mouvement_stock(uuid, text, integer, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fn_receptionner_ligne(uuid, integer, numeric) FROM anon;

-- fn_prochain_numero : anon CONSERVE l'exécution (nécessaire pour la
-- numérotation des commandes e-commerce invitées, cf. exception 'commande'
-- ajoutée ci-dessous) ; fn_valider_code_promo : anon conserve aussi
-- l'exécution (validation d'un code au checkout, par design).

-- Correctif de régression : la migration 39 a ajouté une vérification
-- staff/service_role à fn_prochain_numero SANS exception, ce qui bloquait
-- silencieusement la numérotation des commandes e-commerce créées par un
-- client invité (anon) — seul cas où un rôle non-staff doit légitimement
-- consommer un compteur (aligné avec commandes_ecommerce_anyone_insert).
-- Vérifié : un INSERT anon dans commandes_ecommerce échouait avant ce correctif.
CREATE OR REPLACE FUNCTION public.fn_prochain_numero(p_boutique_id uuid, p_compteur text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero integer;
BEGIN
  IF p_compteur <> 'commande' AND NOT (
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
