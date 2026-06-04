
-- 1. Fix orders insert: require authenticated + customer_id binding
DROP POLICY IF EXISTS orders_insert ON public.orders;
CREATE POLICY orders_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

-- 2. Fix order_items insert: authenticated only
DROP POLICY IF EXISTS oi_insert ON public.order_items;
CREATE POLICY oi_insert ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.customer_id = auth.uid()
  ));

-- 3. Fix vendor policies on orders (vendor_id refs vendors.id, owner is vendors.owner_id)
DROP POLICY IF EXISTS orders_vendor_read ON public.orders;
CREATE POLICY orders_vendor_read ON public.orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = orders.vendor_id AND v.owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS orders_vendor_update ON public.orders;
CREATE POLICY orders_vendor_update ON public.orders
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = orders.vendor_id AND v.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = orders.vendor_id AND v.owner_id = auth.uid()
  ));

-- Fix corresponding order_items vendor read
DROP POLICY IF EXISTS oi_vendor_read ON public.order_items;
CREATE POLICY oi_vendor_read ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id = order_items.vendor_id AND v.owner_id = auth.uid()
  ));

-- Also fix orders_rider_* (rider_id likely refs riders.id, not user)
DROP POLICY IF EXISTS orders_rider_read ON public.orders;
CREATE POLICY orders_rider_read ON public.orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = orders.rider_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS orders_rider_update ON public.orders;
CREATE POLICY orders_rider_update ON public.orders
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = orders.rider_id AND r.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = orders.rider_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS oi_rider_read ON public.order_items;
CREATE POLICY oi_rider_read ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.riders r ON r.id = o.rider_id
    WHERE o.id = order_items.order_id AND r.user_id = auth.uid()
  ));

-- 4. Notifications: prevent null user_id rows
ALTER TABLE public.notifications ALTER COLUMN user_id SET NOT NULL;

-- 5. Revoke EXECUTE on trigger-only SECURITY DEFINER function from public/authenticated
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
