-- TVA (indicatif) + prix plancher de vente + remise manuelle par ligne de
-- vente. Trois besoins liés au même changement métier : autoriser une
-- remise négociée à la caisse sans jamais vendre à perte.
--
-- tva_applicable : simple case à cocher, PUREMENT INFORMATIF pour cette
-- itération — aucun calcul de taxe, aucun affichage facture/reçu. Existe
-- pour ne pas avoir à retoucher le schéma quand le calcul réel sera ajouté.
--
-- prix_limite_vente_usd : prix plancher explicite, distinct de
-- prix_achat_usd — une boutique peut vouloir un plancher au-dessus du pur
-- coût (marge minimale voulue même en promo). Nullable : si absent, le
-- serveur retombe sur prix_achat_usd comme plancher (cf.
-- boutiqueEncaisserVente) ; si les deux sont absents, aucune remise n'est
-- autorisée pour ce produit.
alter table public.produits
  add column tva_applicable boolean not null default false,
  add column prix_limite_vente_usd numeric check (prix_limite_vente_usd is null or prix_limite_vente_usd >= 0);

-- Garde-fou DB en plus de la validation Zod applicative (défense en
-- profondeur, même esprit que le check déjà posé sur prix_promo_usd en
-- migration 52) : le plancher ne doit jamais être inférieur au coût d'achat
-- quand les deux sont renseignés.
alter table public.produits
  add constraint produits_prix_limite_vente_check
  check (
    prix_limite_vente_usd is null
    or prix_achat_usd is null
    or prix_limite_vente_usd >= prix_achat_usd
  );

-- Remise manuelle appliquée par le staff à l'encaissement (édition du prix
-- unitaire à la baisse, toujours vérifiée contre le plancher côté serveur
-- dans boutiqueEncaisserVente). Stockée PAR UNITÉ (même convention que
-- prix_unitaire_usd), donc remise_ligne_usd * quantite = remise totale de la
-- ligne. Enregistrée explicitement plutôt que déduite en comparant à
-- produits.prix_usd au moment du rapport : le prix catalogue peut changer
-- après la vente, la remise réellement appliquée doit rester figée pour
-- l'historique et les rapports (même logique que prix_unitaire_usd déjà figé
-- sur cette table).
alter table public.vente_lignes
  add column remise_ligne_usd numeric(10,2) not null default 0 check (remise_ligne_usd >= 0);
