-- ============================================================================
-- LIVROTO — Boutiques : codes promo / fidélité
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.boutique_promo_type AS ENUM ('pourcentage', 'montant_fixe');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.codes_promo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  code text NOT NULL,
  type_reduction public.boutique_promo_type NOT NULL,
  valeur numeric(10,2) NOT NULL CHECK (valeur > 0),
  montant_min_usd numeric(10,2) NOT NULL DEFAULT 0,
  date_debut timestamptz,
  date_fin timestamptz,
  usage_max integer,
  usage_actuel integer NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (boutique_id, code)
);

CREATE INDEX IF NOT EXISTS codes_promo_boutique_idx ON public.codes_promo(boutique_id) WHERE actif;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.codes_promo TO authenticated;
GRANT ALL ON public.codes_promo TO service_role;
ALTER TABLE public.codes_promo ENABLE ROW LEVEL SECURITY;

-- Pas de lecture publique de cette table : un client ne doit pas pouvoir
-- énumérer tous les codes promo actifs d'une boutique (ni leur usage_actuel,
-- qui refléterait indirectement le volume de ventes). La validation d'un
-- code saisi par le client passe exclusivement par fn_valider_code_promo()
-- (SECURITY DEFINER) ci-dessous, qui ne renvoie qu'un résultat oui/non +
-- montant de remise, jamais la liste des codes.
CREATE POLICY codes_promo_staff_all ON public.codes_promo
  FOR ALL TO authenticated
  USING (public.is_boutique_staff(boutique_id, NULL))
  WITH CHECK (public.is_boutique_staff(boutique_id, ARRAY['admin','vendeur']::public.boutique_role[]));

CREATE TRIGGER codes_promo_set_updated_at BEFORE UPDATE ON public.codes_promo
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Normalisation : codes toujours comparés/stockés en MAJUSCULES (évite les
-- doublons "bienvenue10" / "BIENVENUE10" et les échecs de validation dus à la
-- casse tapée par le client).
CREATE OR REPLACE FUNCTION public.tg_codes_promo_normaliser()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.code := upper(trim(NEW.code));
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_codes_promo_normaliser BEFORE INSERT OR UPDATE ON public.codes_promo
  FOR EACH ROW EXECUTE FUNCTION public.tg_codes_promo_normaliser();

-- Rattache maintenant la FK code_promo_id différée sur ventes (colonne créée
-- sans contrainte en migration 33, car codes_promo n'existait pas encore).
ALTER TABLE public.ventes
  ADD CONSTRAINT ventes_code_promo_fk FOREIGN KEY (code_promo_id) REFERENCES public.codes_promo(id);

-- ----------------------------------------------------------------------------
-- Validation partagée POS + e-commerce : UNE seule fonction de vérité pour
-- qu'un code promo produise TOUJOURS la même remise, quel que soit le canal
-- (évite toute désynchronisation caisse / vitrine en ligne).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_valider_code_promo(
  p_boutique_id uuid,
  p_code text,
  p_montant_usd numeric
)
RETURNS TABLE (valide boolean, motif text, remise_usd numeric, code_promo_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promo public.codes_promo;
  v_remise numeric;
BEGIN
  SELECT * INTO v_promo FROM public.codes_promo
  WHERE boutique_id = p_boutique_id AND code = upper(trim(p_code)) AND actif = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Code promo invalide', 0::numeric, NULL::uuid;
    RETURN;
  END IF;

  IF v_promo.date_debut IS NOT NULL AND now() < v_promo.date_debut THEN
    RETURN QUERY SELECT false, 'Code pas encore actif', 0::numeric, v_promo.id; RETURN;
  END IF;
  IF v_promo.date_fin IS NOT NULL AND now() > v_promo.date_fin THEN
    RETURN QUERY SELECT false, 'Code expiré', 0::numeric, v_promo.id; RETURN;
  END IF;
  IF v_promo.usage_max IS NOT NULL AND v_promo.usage_actuel >= v_promo.usage_max THEN
    RETURN QUERY SELECT false, 'Code déjà utilisé au maximum autorisé', 0::numeric, v_promo.id; RETURN;
  END IF;
  IF p_montant_usd < v_promo.montant_min_usd THEN
    RETURN QUERY SELECT false,
      format('Montant minimum de %s $ requis', v_promo.montant_min_usd), 0::numeric, v_promo.id;
    RETURN;
  END IF;

  v_remise := CASE
    WHEN v_promo.type_reduction = 'pourcentage' THEN round(p_montant_usd * v_promo.valeur / 100, 2)
    ELSE v_promo.valeur
  END;
  v_remise := LEAST(v_remise, p_montant_usd);

  RETURN QUERY SELECT true, 'OK', v_remise, v_promo.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_valider_code_promo(uuid, text, numeric) TO anon, authenticated, service_role;

-- Incrémentation de l'usage : appelée UNE fois la vente/commande finalisée
-- (jamais à la simple validation, pour ne pas gaspiller le quota sur un
-- essai non concrétisé — cf. trigger migration 36 pour l'e-commerce).
CREATE OR REPLACE FUNCTION public.fn_incrementer_usage_code_promo(p_code_promo_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.codes_promo SET usage_actuel = usage_actuel + 1 WHERE id = p_code_promo_id;
$$;

GRANT EXECUTE ON FUNCTION public.fn_incrementer_usage_code_promo(uuid) TO authenticated, service_role;
