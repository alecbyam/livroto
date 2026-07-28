-- ============================================================================
-- LIVROTO — Boutiques : p_roles par défaut NULL sur is_boutique_staff()
--
-- Sans DEFAULT, l'appel SQL "IS NULL OR ..." fonctionnait très bien, mais le
-- générateur de types TypeScript Supabase émettait p_roles comme argument
-- REQUIS (pas de `| undefined`), obligeant chaque appel côté app à caster
-- `null` en dur. Un DEFAULT NULL rend le paramètre réellement optionnel des
-- deux côtés (SQL ET TypeScript généré).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_boutique_staff(p_boutique_id uuid, p_roles public.boutique_role[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boutique_users bu
    WHERE bu.boutique_id = p_boutique_id
      AND bu.user_id = (select auth.uid())
      AND (p_roles IS NULL OR bu.role = ANY(p_roles))
  );
$$;
