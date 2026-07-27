-- =========================================================
-- LIVROTO -- Refonte du catalogue : Category -> Subcategory -> Product
-- Remplace l'ENUM product_category (rigide, non hierarchique) par une
-- vraie table `categories`, et relie product_subcategories dessus.
-- Deja applique en production le 2026-07-27 via Supabase MCP
-- (projet LIVROTO-Frankfurt). Ce fichier documente la migration pour
-- l'historique du repo et une eventuelle reconstruction locale.
-- =========================================================

-- 1. Table categories -----------------------------------------------------
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  icon text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_public_read ON public.categories
  FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY categories_admin_all ON public.categories
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_categories_sort ON public.categories(sort_order) WHERE active;

-- 2. Seed des 15 categories principales -----------------------------------
INSERT INTO public.categories (slug, name, icon, sort_order) VALUES
  ('telephones-tablettes', 'Téléphones & Tablettes',   '📱', 10),
  ('informatique',         'Informatique',             '💻', 20),
  ('electronique',         'Électronique',             '📺', 30),
  ('maison-cuisine',       'Maison & Cuisine',          '🏠', 40),
  ('mode',                 'Mode',                      '👕', 50),
  ('beaute-sante',         'Beauté & Santé',            '💄', 60),
  ('bijoux-montres',       'Bijoux & Montres',          '💍', 70),
  ('cuisine-locale',       'Cuisine & Épicerie locale', '🍲', 80),
  ('bebes-jouets',         'Bébés & Jouets',            '🧸', 90),
  ('automobile-moto',      'Automobile & Moto',         '🚗', 100),
  ('sports-loisirs',       'Sports & Loisirs',          '⚽', 110),
  ('livres-fournitures',   'Livres & Fournitures',      '📚', 120),
  ('jeux-gaming',          'Jeux & Gaming',              '🎮', 130),
  ('animalerie',           'Animalerie',                '🐶', 140),
  ('services-livraison',   'Services de livraison',    '🛵', 150);

-- 3. Lien product_subcategories -> categories -----------------------------
ALTER TABLE public.product_subcategories
  ADD COLUMN category_id uuid REFERENCES public.categories(id);

UPDATE public.product_subcategories s
SET category_id = c.id
FROM public.categories c
WHERE s.parent_category = 'phone_accessories' AND c.slug = 'telephones-tablettes';

UPDATE public.product_subcategories s
SET category_id = c.id
FROM public.categories c
WHERE s.parent_category = 'local_food' AND c.slug = 'cuisine-locale';

UPDATE public.product_subcategories s
SET category_id = c.id
FROM public.categories c
WHERE s.parent_category = 'delivery_service' AND c.slug = 'services-livraison';

UPDATE public.product_subcategories s
SET category_id = c.id
FROM public.categories c
WHERE s.parent_category = 'home_tools' AND c.slug = 'maison-cuisine';

UPDATE public.product_subcategories s
SET category_id = c.id
FROM public.categories c
WHERE s.parent_category = 'beauty' AND c.slug = 'beaute-sante';

UPDATE public.product_subcategories s
SET category_id = c.id
FROM public.categories c
WHERE s.parent_category = 'jewelry' AND c.slug = 'bijoux-montres';

UPDATE public.product_subcategories s
SET category_id = c.id
FROM public.categories c
WHERE s.parent_category = 'computers' AND c.slug = 'informatique';

-- watches : Montres hommes/femmes restent dans Bijoux & Montres,
-- Montres connectees part dans Telephones & Tablettes (wearable tech, pas un bijou)
UPDATE public.product_subcategories s
SET category_id = c.id
FROM public.categories c
WHERE s.parent_category = 'watches' AND s.name IN ('Montres hommes', 'Montres femmes') AND c.slug = 'bijoux-montres';

UPDATE public.product_subcategories s
SET category_id = c.id
FROM public.categories c
WHERE s.parent_category = 'watches' AND s.name = 'Montres connectées' AND c.slug = 'telephones-tablettes';

-- electronics : tout reste en Electronique sauf "Jeux video & consoles" qui devient
-- "Consoles" dans la nouvelle categorie Jeux & Gaming
UPDATE public.product_subcategories s
SET category_id = c.id
FROM public.categories c
WHERE s.parent_category = 'electronics' AND s.name <> 'Jeux vidéo & consoles' AND c.slug = 'electronique';

UPDATE public.product_subcategories s
SET category_id = c.id, name = 'Consoles', slug = 'consoles-gaming'
FROM public.categories c
WHERE s.parent_category = 'electronics' AND s.name = 'Jeux vidéo & consoles' AND c.slug = 'jeux-gaming';

-- Renommage : "Cuisine & vaisselle" (sous Maison) entrait en collision avec la
-- categorie "Cuisine & Epicerie locale" (repas) -> nom desambiguise
UPDATE public.product_subcategories
SET name = 'Ustensiles de cuisine'
WHERE slug = 'cuisine-vaisselle';

-- 3b. Nouvelles sous-categories (categories entierement neuves + complements)
INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'phone_accessories', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Smartphones',          'smartphones',          '📱', 1),
  ('Téléphones classiques','telephones-classiques','📞', 2),
  ('Tablettes',            'tablettes',            '📱', 3)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'telephones-tablettes';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'computers', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('PC de bureau',                 'pc-bureau',       '🖥️', 4),
  ('Moniteurs',                    'moniteurs',       '🖥️', 5),
  ('Claviers & souris',            'claviers-souris', '⌨️', 6),
  ('Stockage (SSD, HDD, USB)',     'stockage',        '💾', 7),
  ('Réseau (routeurs, modems)',    'reseau',          '📶', 8)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'informatique';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'electronics', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Vidéoprojecteurs', 'videoprojecteurs', '📽️', 5),
  ('Drones',           'drones',           '🚁', 6)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'electronique';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'home_tools', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Petit électroménager', 'petit-electromenager', '🔌', 5),
  ('Gros électroménager',  'gros-electromenager',  '🧊', 6),
  ('Décoration',           'decoration',           '🖼️', 7),
  ('Jardin',               'jardin',               '🌿', 8)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'maison-cuisine';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'beauty', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Santé & bien-être', 'sante-bien-etre', '💊', 5)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'beaute-sante';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'jewelry', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Lunettes', 'lunettes', '🕶️', 4)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'bijoux-montres';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'local_food', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Épicerie & produits ménagers', 'epicerie-menager', '🛒', 7),
  ('Hygiène',                      'hygiene',          '🧼', 8)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'cuisine-locale';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'home_tools', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Homme',              'mode-homme',       '👔', 1),
  ('Femme',              'mode-femme',       '👗', 2),
  ('Enfant',             'mode-enfant',      '🧒', 3),
  ('Chaussures',         'chaussures',       '👟', 4),
  ('Sacs',               'sacs',             '👜', 5),
  ('Accessoires de mode','accessoires-mode', '🧣', 6)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'mode';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'home_tools', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Jouets',              'jouets',            '🧸', 1),
  ('Articles pour bébé',  'articles-bebe',     '🍼', 2),
  ('Poussettes',          'poussettes',        '🚼', 3),
  ('Couches',             'couches',           '🧷', 4)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'bebes-jouets';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'home_tools', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Pièces auto',        'pieces-auto',      '🔧', 1),
  ('Accessoires auto',   'accessoires-auto', '🚗', 2),
  ('Motos & pièces moto','motos',            '🏍️', 3),
  ('Pneus',              'pneus',            '🛞', 4),
  ('Lubrifiants',        'lubrifiants',      '🛢️', 5)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'automobile-moto';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'home_tools', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Fitness', 'fitness', '🏋️', 1),
  ('Camping', 'camping', '⛺', 2),
  ('Vélo',    'velo',    '🚲', 3),
  ('Football','football','⚽', 4),
  ('Pêche',   'peche',   '🎣', 5)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'sports-loisirs';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'home_tools', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Livres',                 'livres',                '📖', 1),
  ('Papeterie',               'papeterie',             '✏️', 2),
  ('Fournitures scolaires',   'fournitures-scolaires', '🎒', 3)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'livres-fournitures';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'electronics', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Jeux vidéo',                    'jeux-video',           '🎮', 2),
  ('Manettes & accessoires gaming', 'manettes-accessoires', '🕹️', 3)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'jeux-gaming';

INSERT INTO public.product_subcategories (parent_category, category_id, name, slug, emoji, sort_order)
SELECT 'home_tools', c.id, v.name, v.slug, v.emoji, v.sort_order
FROM public.categories c, (VALUES
  ('Chiens',             'chiens',             '🐕', 1),
  ('Chats',               'chats',              '🐈', 2),
  ('Oiseaux',             'oiseaux',            '🐦', 3),
  ('Nourriture animaux',  'nourriture-animaux', '🦴', 4),
  ('Accessoires animaux', 'accessoires-animaux','🐾', 5)
) AS v(name, slug, emoji, sort_order)
WHERE c.slug = 'animalerie';

-- 4. Basculer products sur subcategory_id uniquement ----------------------
-- Chaque produit garde son subcategory_id existant. La categorie se deduit
-- desormais de la sous-categorie : impossible qu'un produit ait une categorie
-- incoherente avec sa sous-categorie.
ALTER TABLE public.products ALTER COLUMN subcategory_id SET NOT NULL;

-- 5. Nettoyage : supprimer l'ancien systeme enum --------------------------
ALTER TABLE public.product_subcategories ALTER COLUMN category_id SET NOT NULL;
DROP INDEX IF EXISTS idx_subcat_parent;
CREATE INDEX idx_subcat_category ON public.product_subcategories(category_id) WHERE active;

ALTER TABLE public.product_subcategories DROP COLUMN parent_category;
ALTER TABLE public.products DROP COLUMN category;
DROP TYPE public.product_category;
