-- Journal d'audit admin (gap identifié lors de l'audit du 5/08/2026) : jusqu'ici aucune
-- action admin (approuver un vendeur, changer un rôle, couper une promo, résoudre un
-- signalement...) ne laissait de trace de QUI l'a faite. Utile dès qu'il y a plus d'un
-- admin, ou en cas de litige ("qui a suspendu ce livreur ?"). Voir src/lib/audit-log.server.ts.

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_date ON public.admin_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_date ON public.admin_actions(admin_id, created_at DESC);

-- Écrit exclusivement via supabaseAdmin (logAdminAction, appelé depuis des handlers déjà
-- gated assertAdmin) — RLS ci-dessous en défense en profondeur, même pattern que
-- agent_drafts/error_logs.
GRANT ALL ON public.admin_actions TO service_role;

ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_actions_admin_read ON public.admin_actions;
CREATE POLICY admin_actions_admin_read ON public.admin_actions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));
-- Pas de policy INSERT/UPDATE/DELETE pour authenticated : un journal d'audit ne doit être
-- modifiable par PERSONNE une fois écrit, même un admin — seul service_role (l'app, jamais
-- un utilisateur) y écrit, et il n'y a jamais de suppression/édition prévue.
