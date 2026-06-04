-- Drop the policy that exposed callmebot_apikey publicly
DROP POLICY IF EXISTS "vendors_public_read" ON public.vendors;

-- Create a sanitized public view (without callmebot_apikey)
-- View owner (postgres) bypasses RLS so anon/authenticated can read approved vendors via the view
CREATE OR REPLACE VIEW public.vendors_public
WITH (security_invoker = false)
AS
SELECT
  id,
  owner_id,
  shop_name,
  slug,
  description,
  logo_url,
  cover_url,
  whatsapp,
  base_zone_id,
  status,
  rating_avg,
  rating_count,
  created_at,
  updated_at
FROM public.vendors
WHERE status = 'approved'::vendor_status;

GRANT SELECT ON public.vendors_public TO anon, authenticated;