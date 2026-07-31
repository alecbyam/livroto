-- Élargit les modes de paiement du checkout e-commerce boutique (jusqu'ici
-- seulement mobile_money/paiement_livraison, alors que la caisse POS accepte
-- déjà 'carte' — cf. migration 33) et ajoute le suivi d'un paiement FlexPay
-- (statut séparé du statut de traitement de la commande `statut`, même
-- principe que orders.payment_status/orders.status côté marketplace).
alter table public.commandes_ecommerce drop constraint commandes_ecommerce_mode_paiement_check;
alter table public.commandes_ecommerce add constraint commandes_ecommerce_mode_paiement_check
  check (mode_paiement = any (array['mobile_money','paiement_livraison','carte']));

alter table public.commandes_ecommerce
  add column flexpay_order_number text,
  add column statut_paiement text not null default 'non_requis'
    check (statut_paiement in ('non_requis','en_attente','paye','echoue'));

comment on column public.commandes_ecommerce.statut_paiement is
  'non_requis = paiement manuel (carte/paiement à la livraison) ; en_attente/paye/echoue = suivi réel d''un push FlexPay (mobile_money), rempli seulement si la boutique a configuré FlexPay dans Paramètres.';
