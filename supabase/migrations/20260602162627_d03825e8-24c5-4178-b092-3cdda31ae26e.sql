
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "orders_anyone_insert" ON public.orders;
CREATE POLICY "orders_insert" ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (customer_id IS NULL OR customer_id = auth.uid());
