-- Historique persistant des brouillons générés par les agents IA (src/lib/agents.functions.ts).
-- Jusqu'ici un brouillon vivait seulement dans le state React de AiAssistantPanel : perdu au
-- refresh, aucune trace de ce qui a été validé/rejeté/envoyé, aucun historique consultable.
-- Cette table est le backbone du panneau de validation (AgentDraftsPanel) — indépendante de
-- ANTHROPIC_API_KEY : elle ne fait que stocker le résultat d'un appel déjà réussi.

CREATE TABLE IF NOT EXISTS public.agent_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL CHECK (agent IN ('orchestrateur', 'commercial', 'contenu', 'analytics', 'support')),
  input_message text,
  output jsonb NOT NULL,
  status text NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'valide', 'rejete', 'envoye')),
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_drafts_status_date ON public.agent_drafts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_drafts_agent_date ON public.agent_drafts(agent, created_at DESC);

-- Écrit/lu exclusivement via supabaseAdmin dans agents.functions.ts (assertAdmin déjà vérifié
-- en app avant tout accès) — RLS ci-dessous en défense en profondeur, même pattern que le
-- reste du schéma (has_role), au cas où une requête directe passerait par le client anon/authenticated.
GRANT ALL ON public.agent_drafts TO service_role;

ALTER TABLE public.agent_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_drafts_admin_all ON public.agent_drafts;
CREATE POLICY agent_drafts_admin_all ON public.agent_drafts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
