-- Motif/note libre sur une vente à crédit — capturé à la création (POS,
-- "pourquoi ce crédit ?" : ex. "client régulier", "urgence famille"...),
-- jamais obligatoire. Distinct de credit_paiements.note qui documente un
-- PAIEMENT individuel, pas la dette elle-même.
alter table public.credits add column notes text;
