
-- =========================================================
-- LIVROTO — Schéma métier complet
-- =========================================================

-- ---------- ENUMS ----------
CREATE TYPE public.vendor_status AS ENUM ('pending', 'approved', 'suspended', 'rejected');
CREATE TYPE public.rider_status AS ENUM ('pending', 'active', 'offline', 'suspended');
CREATE TYPE public.rider_vehicle AS ENUM ('moto', 'velo', 'pied', 'voiture');
CREATE TYPE public.payment_method AS ENUM ('cash', 'mpesa', 'airtel_money', 'orange_money');
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
CREATE TYPE public.delivery_status AS ENUM ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed');
CREATE TYPE public.review_target AS ENUM ('product', 'vendor', 'rider');
CREATE TYPE public.notification_channel AS ENUM ('whatsapp', 'sms', 'in_app');
CREATE TYPE public.notification_status AS ENUM ('queued', 'sent', 'delivered', 'failed');

-- ---------- PROFILES (compléments) ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_lang text NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------- Fonction utilitaire updated_at ----------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- VENDORS ----------
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  shop_name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  logo_url text,
  cover_url text,
  whatsapp text NOT NULL,
  base_zone_id uuid REFERENCES public.zones(id) ON DELETE SET NULL,
  status vendor_status NOT NULL DEFAULT 'pending',
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendors TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendors_public_read ON public.vendors
  FOR SELECT TO anon, authenticated USING (status = 'approved');
CREATE POLICY vendors_owner_read ON public.vendors
  FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY vendors_owner_insert ON public.vendors
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY vendors_owner_update ON public.vendors
  FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY vendors_admin_all ON public.vendors
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER vendors_set_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- VENDOR_ZONES (vendeur livre dans ces zones) ----------
CREATE TABLE public.vendor_zones (
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  PRIMARY KEY (vendor_id, zone_id)
);
GRANT SELECT ON public.vendor_zones TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_zones TO authenticated;
GRANT ALL ON public.vendor_zones TO service_role;
ALTER TABLE public.vendor_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY vz_public_read ON public.vendor_zones FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY vz_owner_write ON public.vendor_zones
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid()));
CREATE POLICY vz_admin_all ON public.vendor_zones
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ---------- RIDERS ----------
CREATE TABLE public.riders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  whatsapp text NOT NULL,
  vehicle rider_vehicle NOT NULL DEFAULT 'moto',
  id_document_url text,
  status rider_status NOT NULL DEFAULT 'pending',
  is_available boolean NOT NULL DEFAULT false,
  current_lat numeric(9,6),
  current_lng numeric(9,6),
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  total_deliveries integer NOT NULL DEFAULT 0,
  total_earnings_usd numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.riders TO authenticated;
GRANT ALL ON public.riders TO service_role;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;

CREATE POLICY riders_self_read ON public.riders FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY riders_self_insert ON public.riders FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY riders_self_update ON public.riders FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY riders_admin_all ON public.riders
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER riders_set_updated_at BEFORE UPDATE ON public.riders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- RIDER_ZONES ----------
CREATE TABLE public.rider_zones (
  rider_id uuid NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  PRIMARY KEY (rider_id, zone_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rider_zones TO authenticated;
GRANT ALL ON public.rider_zones TO service_role;
ALTER TABLE public.rider_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY rz_self ON public.rider_zones
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.riders r WHERE r.id = rider_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.riders r WHERE r.id = rider_id AND r.user_id = auth.uid()));
CREATE POLICY rz_admin ON public.rider_zones
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ---------- PRODUCTS (extensions) ----------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'piece',
  ADD COLUMN IF NOT EXISTS rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- ORDERS (extensions) ----------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS code text UNIQUE,
  ADD COLUMN IF NOT EXISTS subtotal_usd numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method payment_method NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS payment_status payment_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS customer_notes text,
  ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES public.zones(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Generation d'un code lisible (LIV-XXXXXX) via trigger
CREATE OR REPLACE FUNCTION public.tg_orders_set_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code IS NULL THEN
    NEW.code := 'LIV-' || upper(substr(replace(NEW.id::text,'-',''),1,6));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_set_code ON public.orders;
CREATE TRIGGER orders_set_code BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_set_code();

DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- ORDER_ITEMS ----------
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  unit_price_usd numeric(10,2) NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total_usd numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_order_items_vendor ON public.order_items(vendor_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT INSERT ON public.order_items TO anon;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY oi_insert ON public.order_items
  FOR INSERT TO anon, authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (o.customer_id IS NULL OR o.customer_id = auth.uid()))
  );
CREATE POLICY oi_customer_read ON public.order_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid())
  );
CREATE POLICY oi_vendor_read ON public.order_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = auth.uid())
  );
CREATE POLICY oi_rider_read ON public.order_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.rider_id = auth.uid())
  );
CREATE POLICY oi_admin_all ON public.order_items
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ---------- ORDER_STATUS_HISTORY ----------
CREATE TABLE public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status order_status NOT NULL,
  changed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_osh_order ON public.order_status_history(order_id);
GRANT SELECT, INSERT ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY osh_read ON public.order_status_history
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (o.customer_id = auth.uid() OR o.vendor_id = auth.uid() OR o.rider_id = auth.uid()))
    OR has_role(auth.uid(),'admin')
  );
CREATE POLICY osh_insert ON public.order_status_history
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (o.vendor_id = auth.uid() OR o.rider_id = auth.uid()))
    OR has_role(auth.uid(),'admin')
  );

-- ---------- PAYMENTS ----------
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  amount_usd numeric(10,2) NOT NULL,
  provider_ref text,
  collected_by uuid,
  collected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order ON public.payments(order_id);
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_read ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (o.customer_id = auth.uid() OR o.vendor_id = auth.uid() OR o.rider_id = auth.uid()))
    OR has_role(auth.uid(),'admin')
  );
CREATE POLICY payments_rider_write ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.rider_id = auth.uid())
  );
CREATE POLICY payments_admin_all ON public.payments
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- DELIVERIES ----------
CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id uuid REFERENCES public.riders(id) ON DELETE SET NULL,
  status delivery_status NOT NULL DEFAULT 'assigned',
  pickup_lat numeric(9,6),
  pickup_lng numeric(9,6),
  dropoff_lat numeric(9,6),
  dropoff_lng numeric(9,6),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  proof_photo_url text,
  failure_reason text,
  rider_fee_usd numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY del_read ON public.deliveries
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND (o.customer_id = auth.uid() OR o.vendor_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.riders r WHERE r.id = rider_id AND r.user_id = auth.uid())
    OR has_role(auth.uid(),'admin')
  );
CREATE POLICY del_rider_update ON public.deliveries
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.riders r WHERE r.id = rider_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.riders r WHERE r.id = rider_id AND r.user_id = auth.uid()));
CREATE POLICY del_admin_all ON public.deliveries
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER deliveries_set_updated_at BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- REVIEWS ----------
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  target review_target NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  rider_id uuid REFERENCES public.riders(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, author_id, target, product_id, vendor_id, rider_id)
);
CREATE INDEX idx_reviews_product ON public.reviews(product_id);
CREATE INDEX idx_reviews_vendor ON public.reviews(vendor_id);
CREATE INDEX idx_reviews_rider ON public.reviews(rider_id);
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY reviews_public_read ON public.reviews FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY reviews_author_insert ON public.reviews
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id
      AND o.customer_id = auth.uid() AND o.status = 'delivered')
  );
CREATE POLICY reviews_author_update ON public.reviews
  FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY reviews_author_delete ON public.reviews
  FOR DELETE TO authenticated USING (author_id = auth.uid());
CREATE POLICY reviews_admin_all ON public.reviews
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ---------- NOTIFICATIONS ----------
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  channel notification_channel NOT NULL DEFAULT 'whatsapp',
  status notification_status NOT NULL DEFAULT 'queued',
  to_phone text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON public.notifications(user_id);
CREATE INDEX idx_notif_order ON public.notifications(order_id);
GRANT SELECT ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_owner_read ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notif_admin_all ON public.notifications
  FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- ---------- TRIGGER: historiser les changements de statut de commande ----------
CREATE OR REPLACE FUNCTION public.tg_orders_log_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_status_history(order_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_history(order_id, status, changed_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_log_status ON public.orders;
CREATE TRIGGER orders_log_status AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_orders_log_status();

-- ---------- TRIGGER: recalcul des notes moyennes ----------
CREATE OR REPLACE FUNCTION public.tg_reviews_recalc()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  rid uuid; pid uuid; vid uuid;
BEGIN
  rid := COALESCE(NEW.rider_id, OLD.rider_id);
  pid := COALESCE(NEW.product_id, OLD.product_id);
  vid := COALESCE(NEW.vendor_id, OLD.vendor_id);

  IF pid IS NOT NULL THEN
    UPDATE public.products p SET
      rating_avg = COALESCE((SELECT round(avg(rating)::numeric,2) FROM public.reviews WHERE product_id = pid),0),
      rating_count = (SELECT count(*) FROM public.reviews WHERE product_id = pid)
    WHERE p.id = pid;
  END IF;
  IF vid IS NOT NULL THEN
    UPDATE public.vendors v SET
      rating_avg = COALESCE((SELECT round(avg(rating)::numeric,2) FROM public.reviews WHERE vendor_id = vid),0),
      rating_count = (SELECT count(*) FROM public.reviews WHERE vendor_id = vid)
    WHERE v.id = vid;
  END IF;
  IF rid IS NOT NULL THEN
    UPDATE public.riders r SET
      rating_avg = COALESCE((SELECT round(avg(rating)::numeric,2) FROM public.reviews WHERE rider_id = rid),0),
      rating_count = (SELECT count(*) FROM public.reviews WHERE rider_id = rid)
    WHERE r.id = rid;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS reviews_recalc ON public.reviews;
CREATE TRIGGER reviews_recalc AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.tg_reviews_recalc();
