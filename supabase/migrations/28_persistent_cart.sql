-- Panier persistant en base : une ligne par utilisateur (items en jsonb).
-- But : le panier survit entre appareils / vidage de cache, et l'index updated_at
-- permettra plus tard un cron de relance « panier abandonné » par WhatsApp.

CREATE TABLE IF NOT EXISTS public.carts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carts_updated_idx ON public.carts(updated_at);

GRANT ALL ON public.carts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur ne lit/écrit QUE son propre panier.
DROP POLICY IF EXISTS carts_owner_all ON public.carts;
CREATE POLICY carts_owner_all ON public.carts
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
