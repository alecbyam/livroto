ALTER TABLE public.products ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}'::text[];

-- Backfill: si image_url existe et images est vide, initialise images avec [image_url]
UPDATE public.products
SET images = ARRAY[image_url]
WHERE image_url IS NOT NULL AND (images IS NULL OR array_length(images,1) IS NULL);

-- Contrainte : max 5 images
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_images_max5;
ALTER TABLE public.products ADD CONSTRAINT products_images_max5 CHECK (array_length(images, 1) IS NULL OR array_length(images, 1) <= 5);