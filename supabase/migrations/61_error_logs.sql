-- Surveillance d'erreurs en production (gap identifié lors de l'audit du 5/08/2026) :
-- avant cette migration, aucune erreur front (au-delà du crash-boundary Lovable, no-op hors
-- de l'éditeur Lovable) ni aucune erreur SSR catastrophique n'était persistée nulle part —
-- juste un console.error perdu dans les logs Railway. Cette table est le stockage interne
-- (pas de SaaS tiers, pas de fuite de données) pour src/lib/error-reporting.{ts,server.ts}.

CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('client_boundary', 'client_global', 'ssr')),
  message text NOT NULL,
  stack text,
  url text,
  user_id uuid REFERENCES auth.users(id),
  user_agent text,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_error_logs_resolved_date ON public.error_logs(resolved, created_at DESC);

-- Écrit exclusivement via supabaseAdmin (reportClientError/reportServerError sont volontairement
-- accessibles à un visiteur anonyme — une erreur peut survenir avant tout login — donc aucune
-- vérification de rôle possible côté app à l'écriture ; RLS ci-dessous ferme la lecture/écriture
-- directe pour anon/authenticated, seul service_role peut agir, même pattern que agent_drafts).
GRANT ALL ON public.error_logs TO service_role;

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_logs_admin_all ON public.error_logs;
CREATE POLICY error_logs_admin_all ON public.error_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
