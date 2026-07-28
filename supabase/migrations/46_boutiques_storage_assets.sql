-- ============================================================================
-- LIVROTO — Boutiques : bucket public pour les assets de marque (logo, visuels)
--
-- Public en lecture (un logo est affiché sur la vitrine publique, le favicon,
-- les factures — rien de secret) ; écriture réservée au staff admin de la
-- boutique propriétaire du dossier `<boutique_id>/...`, même modèle que le
-- bucket boutiques-qr (migration 41).
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('boutiques-assets', 'boutiques-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "boutiques_assets_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'boutiques-assets');

CREATE POLICY "boutiques_assets_admin_write"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'boutiques-assets'
  AND public.is_boutique_staff(((storage.foldername(name))[1])::uuid, ARRAY['admin']::public.boutique_role[])
);

CREATE POLICY "boutiques_assets_admin_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'boutiques-assets'
  AND public.is_boutique_staff(((storage.foldername(name))[1])::uuid, ARRAY['admin']::public.boutique_role[])
);

CREATE POLICY "boutiques_assets_admin_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'boutiques-assets'
  AND public.is_boutique_staff(((storage.foldername(name))[1])::uuid, ARRAY['admin']::public.boutique_role[])
);
