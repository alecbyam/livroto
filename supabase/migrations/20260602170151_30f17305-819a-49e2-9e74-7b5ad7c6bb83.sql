
-- 1. Table sous-catégories
CREATE TABLE public.product_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_category public.product_category NOT NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  emoji text,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_subcategories TO anon, authenticated;
GRANT ALL ON public.product_subcategories TO service_role;

ALTER TABLE public.product_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY subcat_public_read ON public.product_subcategories
  FOR SELECT TO anon, authenticated
  USING (active = true);

CREATE POLICY subcat_admin_all ON public.product_subcategories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_subcat_parent ON public.product_subcategories(parent_category) WHERE active;

-- 2. Lien produit → sous-catégorie
ALTER TABLE public.products
  ADD COLUMN subcategory_id uuid REFERENCES public.product_subcategories(id) ON DELETE SET NULL;

CREATE INDEX idx_products_subcategory ON public.products(subcategory_id);

-- 3. Seed sous-catégories courantes
INSERT INTO public.product_subcategories (parent_category, name, slug, emoji, sort_order) VALUES
  ('phone_accessories', 'Chargeurs & câbles', 'chargeurs-cables', '🔌', 10),
  ('phone_accessories', 'Écouteurs & audio',  'ecouteurs-audio',  '🎧', 20),
  ('phone_accessories', 'Coques & protections','coques-protections','📱', 30),
  ('phone_accessories', 'Power banks',         'power-banks',      '🔋', 40),
  ('phone_accessories', 'Cartes mémoire & USB','cartes-usb',       '💾', 50),
  ('phone_accessories', 'Supports & gadgets',  'supports-gadgets', '🛠️', 60),

  ('local_food', 'Plats préparés',  'plats-prepares', '🍛', 10),
  ('local_food', 'Snacks & beignets','snacks-beignets','🍩', 20),
  ('local_food', 'Boissons & jus',  'boissons-jus',   '🧃', 30),
  ('local_food', 'Pâtes & farines', 'pates-farines',  '🥜', 40),
  ('local_food', 'Fruits & légumes','fruits-legumes', '🍅', 50),
  ('local_food', 'Petit-déjeuner',  'petit-dejeuner', '☕', 60),

  ('delivery_service', 'Course express',    'course-express',    '⚡', 10),
  ('delivery_service', 'Livraison courses', 'livraison-courses', '🛍️', 20),
  ('delivery_service', 'Livraison repas',   'livraison-repas',   '🛵', 30),
  ('delivery_service', 'Livraison colis',   'livraison-colis',   '📦', 40);
