
-- RLS for products bucket: vendors upload/manage their own folder, anyone authenticated can read
CREATE POLICY "products_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'products');

CREATE POLICY "products_vendor_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'products'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "products_vendor_update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'products'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "products_vendor_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'products'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
