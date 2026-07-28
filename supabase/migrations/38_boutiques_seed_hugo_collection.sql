-- ============================================================================
-- LIVROTO — Données de test : Hugo Collection (boutique + catalogue +
-- fournisseurs + commandes e-commerce avec code promo)
--
-- Ne crée AUCUN compte utilisateur (auth.users) : l'admin Hugo Collection
-- doit s'inscrire via le flux normal (/auth), puis être rattaché avec :
--
--   INSERT INTO public.boutique_users (boutique_id, user_id, role)
--   VALUES ('11111111-1111-1111-1111-111111111111', '<uuid auth.users du compte créé>', 'admin');
--
-- (cf. checklist "ajouter une nouvelle boutique cliente" fournie séparément)
--
-- qr_code_data est généré automatiquement par le trigger de la migration 32
-- dès l'insertion ci-dessous (vérifiable immédiatement en base). qr_code_url
-- (l'image PNG) reste NULL : elle est produite par le script applicatif
-- `scripts/generer-qr-produits.ts` (lib `qrcode` + upload Supabase Storage),
-- à exécuter une fois le bucket de stockage configuré (Phase "Stock + QR").
-- ============================================================================

INSERT INTO public.boutiques (id, slug, nom, devise, adresse, telephone, email, actif)
VALUES (
  '11111111-1111-1111-1111-111111111111', 'hugo-collection', 'Hugo Collection', 'USD',
  'Avenue Yambi, Quartier Ndoromo, Bunia', '+243900000001', 'contact@hugo-collection.example',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fournisseurs (boutique_id, nom, contact, telephone, adresse) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Kivu Textiles Sarl', 'Jean Mbala', '+243810000001', 'Goma, RDC'),
  ('11111111-1111-1111-1111-111111111111', 'Import Mode Kampala', 'Grace Nakato', '+256700000002', 'Kampala, Ouganda')
ON CONFLICT DO NOTHING;

INSERT INTO public.produits (boutique_id, nom, categorie, taille, couleur, prix_usd, quantite, seuil_alerte, description) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Robe wax élégante', 'vetement', 'M', 'Multicolore', 35.00, 12, 3, 'Robe en tissu wax, coupe cintrée'),
  ('11111111-1111-1111-1111-111111111111', 'Chemise homme slim fit', 'vetement', 'L', 'Blanc', 22.00, 20, 5, 'Chemise en coton, coupe slim'),
  ('11111111-1111-1111-1111-111111111111', 'Jean droit femme', 'vetement', '38', 'Bleu', 28.00, 15, 4, 'Jean taille haute coupe droite'),
  ('11111111-1111-1111-1111-111111111111', 'Sac à main cuir', 'accessoire', NULL, 'Noir', 40.00, 8, 2, 'Sac à main en simili-cuir'),
  ('11111111-1111-1111-1111-111111111111', 'Ceinture cuir homme', 'accessoire', '90cm', 'Marron', 12.00, 25, 5, 'Ceinture en cuir véritable'),
  ('11111111-1111-1111-1111-111111111111', 'Boubou traditionnel', 'vetement', 'XL', 'Vert', 45.00, 6, 2, 'Boubou brodé main'),
  ('11111111-1111-1111-1111-111111111111', 'Casquette snapback', 'accessoire', 'Unique', 'Noir/Rouge', 8.00, 30, 6, 'Casquette ajustable'),
  ('11111111-1111-1111-1111-111111111111', 'Baskets montantes', 'vetement', '42', 'Blanc', 32.00, 10, 3, 'Baskets montantes unisexe'),
  ('11111111-1111-1111-1111-111111111111', 'Foulard soie', 'accessoire', NULL, 'Rouge', 15.00, 18, 4, 'Foulard en soie imprimée'),
  ('11111111-1111-1111-1111-111111111111', 'Pantalon costume', 'vetement', '40', 'Gris', 30.00, 9, 3, 'Pantalon de costume classique')
ON CONFLICT DO NOTHING;

-- Code promo de test : -10% dès 20 $ d'achat, plafonné à 100 utilisations.
INSERT INTO public.codes_promo (boutique_id, code, type_reduction, valeur, montant_min_usd, usage_max, actif)
VALUES ('11111111-1111-1111-1111-111111111111', 'BIENVENUE10', 'pourcentage', 10, 20, 100, true)
ON CONFLICT (boutique_id, code) DO NOTHING;

-- Deux clients invités de test (checkout sans compte).
INSERT INTO public.clients_boutique (id, boutique_id, nom, telephone, adresse_defaut) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'Aline Kahindo', '+243850000099', 'Quartier Simbilyabo, Bunia'),
  ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111',
   'Patrick Drazi', '+243850000098', 'Quartier Mudzipela, Bunia')
ON CONFLICT (id) DO NOTHING;

-- Trois commandes e-commerce simulées, à différents stades du cycle de vie :
-- une en attente (pas encore payée), une confirmée avec code promo (exerce le
-- trigger tg_commandes_ecommerce_stock -> vente miroir + décrément de stock +
-- facture générée), une livrée sans code promo.
DO $$
DECLARE
  v_boutique_id uuid := '11111111-1111-1111-1111-111111111111';
  v_client1 uuid := '22222222-2222-2222-2222-222222222222';
  v_client2 uuid := '22222222-2222-2222-2222-222222222223';
  v_produit_robe uuid;
  v_produit_foulard uuid;
  v_produit_chemise uuid;
  v_produit_ceinture uuid;
  v_promo_id uuid;
  v_commande_id uuid;
  v_sous_total numeric;
  v_remise numeric;
BEGIN
  SELECT id INTO v_produit_robe FROM public.produits WHERE boutique_id = v_boutique_id AND nom = 'Robe wax élégante';
  SELECT id INTO v_produit_foulard FROM public.produits WHERE boutique_id = v_boutique_id AND nom = 'Foulard soie';
  SELECT id INTO v_produit_chemise FROM public.produits WHERE boutique_id = v_boutique_id AND nom = 'Chemise homme slim fit';
  SELECT id INTO v_produit_ceinture FROM public.produits WHERE boutique_id = v_boutique_id AND nom = 'Ceinture cuir homme';
  SELECT id INTO v_promo_id FROM public.codes_promo WHERE boutique_id = v_boutique_id AND code = 'BIENVENUE10';

  -- Commande 1 : en attente de paiement (aucun impact stock pour l'instant).
  v_sous_total := 35.00 + 15.00;
  INSERT INTO public.commandes_ecommerce (
    boutique_id, client_id, statut, adresse_livraison, mode_paiement,
    sous_total_usd, remise_usd, frais_livraison_usd, total_usd
  ) VALUES (
    v_boutique_id, v_client1, 'en_attente', 'Quartier Simbilyabo, Bunia', 'paiement_livraison',
    v_sous_total, 0, 2.00, v_sous_total + 2.00
  ) RETURNING id INTO v_commande_id;

  INSERT INTO public.commande_lignes (commande_id, produit_id, quantite, prix_unitaire_usd, total_ligne_usd) VALUES
    (v_commande_id, v_produit_robe, 1, 35.00, 35.00),
    (v_commande_id, v_produit_foulard, 1, 15.00, 15.00);

  -- Commande 2 : confirmée avec code promo BIENVENUE10 (-10%). Déclenche la
  -- création de la vente miroir + décrément de stock + facture automatique.
  v_sous_total := 22.00 + 12.00;
  v_remise := round(v_sous_total * 0.10, 2);
  INSERT INTO public.commandes_ecommerce (
    boutique_id, client_id, statut, adresse_livraison, mode_paiement,
    code_promo_id, sous_total_usd, remise_usd, frais_livraison_usd, total_usd
  ) VALUES (
    v_boutique_id, v_client2, 'en_attente', 'Quartier Mudzipela, Bunia', 'mobile_money',
    v_promo_id, v_sous_total, v_remise, 2.00, v_sous_total - v_remise + 2.00
  ) RETURNING id INTO v_commande_id;

  INSERT INTO public.commande_lignes (commande_id, produit_id, quantite, prix_unitaire_usd, total_ligne_usd) VALUES
    (v_commande_id, v_produit_chemise, 1, 22.00, 22.00),
    (v_commande_id, v_produit_ceinture, 1, 12.00, 12.00);

  UPDATE public.commandes_ecommerce SET statut = 'confirmee' WHERE id = v_commande_id;

  -- Commande 3 : déjà livrée (démonstration du cycle complet), sans promo.
  v_sous_total := 32.00;
  INSERT INTO public.commandes_ecommerce (
    boutique_id, client_id, statut, adresse_livraison, mode_paiement,
    sous_total_usd, remise_usd, frais_livraison_usd, total_usd
  ) VALUES (
    v_boutique_id, v_client1, 'en_attente', 'Quartier Simbilyabo, Bunia', 'mobile_money',
    v_sous_total, 0, 2.00, v_sous_total + 2.00
  ) RETURNING id INTO v_commande_id;

  INSERT INTO public.commande_lignes (commande_id, produit_id, quantite, prix_unitaire_usd, total_ligne_usd) VALUES
    (v_commande_id, (SELECT id FROM public.produits WHERE boutique_id = v_boutique_id AND nom = 'Baskets montantes'), 1, 32.00, 32.00);

  UPDATE public.commandes_ecommerce SET statut = 'confirmee' WHERE id = v_commande_id;
  UPDATE public.commandes_ecommerce SET statut = 'expediee' WHERE id = v_commande_id;
  UPDATE public.commandes_ecommerce SET statut = 'livree' WHERE id = v_commande_id;
END $$;
