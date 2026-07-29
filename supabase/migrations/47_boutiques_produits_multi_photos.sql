-- Support de plusieurs photos par produit (jusqu'ici : une seule image_url,
-- et aucun moyen de l'uploader depuis le formulaire de création produit).
-- `images` devient la source de vérité ; `image_url` reste maintenue en
-- synchro (toujours = images[1], la première photo) via trigger, pour que
-- TOUS les endroits
-- qui lisent déjà `image_url` (grille caisse, vitrine, panier) continuent de
-- fonctionner sans aucune modification.

alter table public.produits
  add column if not exists images text[] not null default '{}'::text[];

alter table public.produits
  add constraint produits_images_max_8 check (cardinality(images) <= 8);

-- Reprend l'image existante (le cas échéant) comme première photo.
update public.produits
set images = array[image_url]
where image_url is not null and cardinality(images) = 0;

create or replace function public.tg_produits_sync_image_url()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.image_url := new.images[1];
  return new;
end;
$$;

drop trigger if exists trg_produits_sync_image_url on public.produits;
create trigger trg_produits_sync_image_url
  before insert or update of images on public.produits
  for each row execute function public.tg_produits_sync_image_url();

-- Bucket dédié aux photos produit (public en lecture — un catalogue est
-- public par nature ; écriture réservée au staff admin+vendeur, même
-- pattern que boutiques-qr, PAS boutiques-assets qui est admin-only car
-- réservé à l'identité de marque de la boutique).
insert into storage.buckets (id, name, public)
values ('boutiques-produits', 'boutiques-produits', true)
on conflict (id) do nothing;

create policy "boutiques_produits_public_read"
  on storage.objects for select
  using (bucket_id = 'boutiques-produits');

create policy "boutiques_produits_staff_write"
  on storage.objects for insert
  with check (
    bucket_id = 'boutiques-produits'
    and is_boutique_staff(((storage.foldername(name))[1])::uuid, array['admin','vendeur']::boutique_role[])
  );

create policy "boutiques_produits_staff_update"
  on storage.objects for update
  using (
    bucket_id = 'boutiques-produits'
    and is_boutique_staff(((storage.foldername(name))[1])::uuid, array['admin','vendeur']::boutique_role[])
  );

create policy "boutiques_produits_staff_delete"
  on storage.objects for delete
  using (
    bucket_id = 'boutiques-produits'
    and is_boutique_staff(((storage.foldername(name))[1])::uuid, array['admin','vendeur']::boutique_role[])
  );
