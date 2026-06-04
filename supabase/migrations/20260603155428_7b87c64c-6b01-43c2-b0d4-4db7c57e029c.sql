
-- Coupon types
DO $$ BEGIN
  CREATE TYPE public.coupon_type AS ENUM ('fixed', 'percent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  type public.coupon_type NOT NULL DEFAULT 'fixed',
  value numeric NOT NULL CHECK (value > 0),
  min_order_usd numeric NOT NULL DEFAULT 0,
  max_discount_usd numeric,
  max_uses integer,
  max_uses_per_user integer NOT NULL DEFAULT 1,
  uses_count integer NOT NULL DEFAULT 0,
  starts_at timestamptz,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.coupons TO anon, authenticated;
GRANT ALL ON public.coupons TO service_role;

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY coupons_public_read ON public.coupons
  FOR SELECT TO anon, authenticated
  USING (active = true);

CREATE POLICY coupons_admin_all ON public.coupons
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Track coupon on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS discount_usd numeric NOT NULL DEFAULT 0;

-- Seed welcome coupon
INSERT INTO public.coupons (code, description, type, value, min_order_usd, max_uses_per_user)
VALUES ('BIENVENUE', 'Bienvenue sur Livroto : -2 $ dès 10 $ d''achat', 'fixed', 2, 10, 1)
ON CONFLICT (code) DO NOTHING;
