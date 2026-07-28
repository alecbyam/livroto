-- ============================================================================
-- LIVROTO — Boutiques : bucket de stockage pour les images QR code produit
--
-- Bucket public en lecture (une étiquette QR n'a rien de secret — elle doit
-- être imprimable et scannable sans authentification) ; écriture réservée au
-- staff de la boutique propriétaire du dossier `<boutique_id>/...`, sur le
-- même modèle que la policy storage.objects du bucket `products` (migration
-- du 3/06) mais avec is_boutique_staff() au lieu d'une comparaison directe à
-- auth.uid() (l'objet appartient à la boutique, pas à un utilisateur).
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('boutiques-qr', 'boutiques-qr', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "boutiques_qr_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'boutiques-qr');

CREATE POLICY "boutiques_qr_staff_write"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'boutiques-qr'
  AND public.is_boutique_staff(((storage.foldername(name))[1])::uuid, ARRAY['admin','vendeur']::public.boutique_role[])
);

CREATE POLICY "boutiques_qr_staff_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'boutiques-qr'
  AND public.is_boutique_staff(((storage.foldername(name))[1])::uuid, ARRAY['admin','vendeur']::public.boutique_role[])
);

CREATE POLICY "boutiques_qr_staff_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'boutiques-qr'
  AND public.is_boutique_staff(((storage.foldername(name))[1])::uuid, ARRAY['admin','vendeur']::public.boutique_role[])
);
