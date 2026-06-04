DO $$
DECLARE
  v_owner uuid := '85fd37a8-56fc-44c9-848c-f1377bbf96b8';
BEGIN
  -- Vendor metadata row (slug unique)
  INSERT INTO public.vendors (owner_id, shop_name, slug, whatsapp, description, status)
  VALUES (v_owner, 'Livroto Bunia', 'livroto-bunia', '243990000000',
          'La boutique officielle Livroto à Bunia.', 'approved')
  ON CONFLICT (slug) DO NOTHING;

  -- Products are linked by vendor_id = owner user id (per current schema)
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE vendor_id = v_owner) THEN
    INSERT INTO public.products (vendor_id, name, category, price_usd, stock, emoji, description, approved, slug, unit) VALUES
    (v_owner,'Chargeur rapide Type-C','phone_accessories',6,25,'🔌','Charge ton smartphone en moins d''une heure.',true,'chargeur-type-c','piece'),
    (v_owner,'Écouteurs filaires basse','phone_accessories',4,40,'🎧','Son clair pour appels WhatsApp et musique.',true,'ecouteurs-filaires','piece'),
    (v_owner,'Coque silicone universelle','phone_accessories',3,30,'📱','Protège ton téléphone des chutes.',true,'coque-silicone','piece'),
    (v_owner,'Power bank 10 000 mAh','phone_accessories',15,12,'🔋','Recharge 3 fois ton téléphone.',true,'power-bank-10k','piece'),
    (v_owner,'Câble USB renforcé','phone_accessories',2,0,'🪢','Solide, ne casse pas vite.',true,'cable-usb','piece'),
    (v_owner,'Fundi maison (1 part)','local_food',3,50,'🥜','Pâte d''arachide locale, fraîchement préparée.',true,'fundi-maison','part'),
    (v_owner,'Beignets sucrés (x6)','local_food',1.5,60,'🍩','Croustillants, encore chauds.',true,'beignets-x6','pack'),
    (v_owner,'Jus de bissap 1L','local_food',2,20,'🧃','Jus naturel d''hibiscus, sans conservateur.',true,'jus-bissap-1l','bouteille'),
    (v_owner,'Riz au poulet (assiette)','local_food',5,18,'🍛','Plat complet, prêt à manger.',true,'riz-poulet','assiette'),
    (v_owner,'Course express (colis)','delivery_service',3,99,'🛵','On va chercher et on livre, en ville.',true,'course-express','course'),
    (v_owner,'Livraison bureau / ONG','delivery_service',10,99,'📦','Livraison professionnelle, sur rendez-vous.',true,'livraison-bureau','course'),
    (v_owner,'Livraison urgente','delivery_service',8,99,'⚡','Sous 1h, n''importe où dans Bunia.',true,'livraison-urgente','course');
  END IF;
END $$;