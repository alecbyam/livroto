CREATE TABLE public.favorites (
  user_id    uuid NOT NULL,
  product_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY fav_select_own ON public.favorites
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY fav_insert_own ON public.favorites
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY fav_delete_own ON public.favorites
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_favorites_product ON public.favorites(product_id);