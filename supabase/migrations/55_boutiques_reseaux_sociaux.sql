-- Liens réseaux sociaux par boutique (affichés en pied de page vitrine) +
-- adresse réelle de Hugo Collection. Colonnes nullables, génériques pour
-- toute future boutique cliente — pas de policy à toucher, déjà couvertes par
-- boutiques_public_read/boutiques_staff_read (migration 31).
alter table public.boutiques
  add column facebook_url text,
  add column tiktok_url text,
  add column whatsapp_url text;

update public.boutiques
set adresse = 'Quartier Lumumba, Avenue Mulenge, au niveau du rond-point Gouvernorat'
where slug = 'hugo-collection';
