-- Sous-catégories par catégorie (ex: "Chemises", "Robes" sous vêtements ;
-- "Sacs", "Ceintures" sous accessoires) + prix d'achat par produit (pour
-- calculer une marge — jusqu'ici seul le prix de vente existait sur le
-- produit, le coût n'était capturé qu'au niveau des lignes de bon de
-- commande fournisseur, jamais reporté sur le produit lui-même).

create table public.sous_categories (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  categorie text not null check (categorie in ('vetement', 'accessoire')),
  nom text not null,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (boutique_id, categorie, nom)
);

create index sous_categories_boutique_idx on public.sous_categories (boutique_id, categorie);

alter table public.sous_categories enable row level security;

create policy "sous_categories_staff_read"
  on public.sous_categories for select
  using (is_boutique_staff(boutique_id, null));

create policy "sous_categories_staff_write"
  on public.sous_categories for insert
  with check (is_boutique_staff(boutique_id, array['admin','vendeur']::boutique_role[]));

create policy "sous_categories_staff_update"
  on public.sous_categories for update
  using (is_boutique_staff(boutique_id, array['admin','vendeur']::boutique_role[]));

create policy "sous_categories_staff_delete"
  on public.sous_categories for delete
  using (is_boutique_staff(boutique_id, array['admin']::boutique_role[]));

alter table public.produits
  add column sous_categorie_id uuid references public.sous_categories(id) on delete set null,
  add column prix_achat_usd numeric check (prix_achat_usd is null or prix_achat_usd >= 0);
