-- Use security_invoker so the view respects RLS of the caller (recommended by Supabase linter)
CREATE OR REPLACE VIEW public.vendors_public
WITH (security_invoker = true)
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

-- Re-add a public SELECT policy on the base table (needed for the security_invoker view to work for anon/authenticated)
CREATE POLICY "vendors_public_read"
  ON public.vendors
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved'::vendor_status);

-- Block direct SELECT of the secret column from anon and authenticated.
-- Owner code paths (dashboard + notifications) use supabaseAdmin to read it.
REVOKE SELECT (callmebot_apikey) ON public.vendors FROM anon, authenticated;