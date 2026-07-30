-- Catégories dynamiques (jusqu'ici : enum fixe 'vetement'/'accessoire', aucun
-- moyen d'en créer d'autres). Chaque boutique peut désormais créer ses
-- propres catégories, chacune ayant ses propres sous-catégories (déjà
-- existantes depuis la migration 48, mais liées par du texte contraint —
-- migrées ici vers une vraie FK).
--
-- Nommée `boutique_categories` (PAS `categories`) : une table `categories`
-- existe déjà pour le catalogue du marketplace Livroto (colonnes slug/name/
-- icon/sort_order, aucun boutique_id) — collision de nom évitée exprès,
-- même logique que tout le reste du module (préfixe/français dédié).

create table public.boutique_categories (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  nom text not null,
  icone text, -- emoji libre, optionnel (fallback générique côté UI si absent)
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  unique (boutique_id, nom)
);

create index boutique_categories_boutique_idx on public.boutique_categories (boutique_id);

alter table public.boutique_categories enable row level security;

create policy "boutique_categories_staff_read"
  on public.boutique_categories for select
  using (is_boutique_staff(boutique_id, null));

create policy "boutique_categories_staff_write"
  on public.boutique_categories for insert
  with check (is_boutique_staff(boutique_id, array['admin','vendeur']::boutique_role[]));

create policy "boutique_categories_staff_update"
  on public.boutique_categories for update
  using (is_boutique_staff(boutique_id, array['admin','vendeur']::boutique_role[]));

create policy "boutique_categories_staff_delete"
  on public.boutique_categories for delete
  using (is_boutique_staff(boutique_id, array['admin']::boutique_role[]));

-- Seed : une catégorie par valeur d'enum déjà utilisée, pour CHAQUE boutique
-- existante — préserve le classement actuel des produits sans rien casser.
insert into public.boutique_categories (boutique_id, nom, icone)
select distinct boutique_id, 'Vêtements', '👕' from public.produits where categorie = 'vetement'
union
select distinct boutique_id, 'Accessoires', '👜' from public.produits where categorie = 'accessoire'
union
select distinct boutique_id, 'Vêtements', '👕' from public.sous_categories where categorie = 'vetement'
union
select distinct boutique_id, 'Accessoires', '👜' from public.sous_categories where categorie = 'accessoire'
on conflict (boutique_id, nom) do nothing;

-- Filet de sécurité : toute boutique qui n'aurait ni produit ni sous-catégorie
-- (boutique flambant neuve) reçoit quand même les 2 catégories de départ.
insert into public.boutique_categories (boutique_id, nom, icone)
select b.id, 'Vêtements', '👕' from public.boutiques b
where not exists (select 1 from public.boutique_categories c where c.boutique_id = b.id and c.nom = 'Vêtements')
on conflict (boutique_id, nom) do nothing;

insert into public.boutique_categories (boutique_id, nom, icone)
select b.id, 'Accessoires', '👜' from public.boutiques b
where not exists (select 1 from public.boutique_categories c where c.boutique_id = b.id and c.nom = 'Accessoires')
on conflict (boutique_id, nom) do nothing;

-- ---------------------------------------------------------------------------
-- produits : categorie (text) -> categorie_id (FK vers boutique_categories)
-- ---------------------------------------------------------------------------
alter table public.produits add column categorie_id uuid references public.boutique_categories(id);

update public.produits p
set categorie_id = c.id
from public.boutique_categories c
where c.boutique_id = p.boutique_id
  and c.nom = case when p.categorie = 'vetement' then 'Vêtements' else 'Accessoires' end;

alter table public.produits alter column categorie_id set not null;
alter table public.produits drop constraint produits_categorie_check;
alter table public.produits drop column categorie;

-- ---------------------------------------------------------------------------
-- sous_categories : categorie (text) -> categorie_id (FK vers boutique_categories)
-- ---------------------------------------------------------------------------
alter table public.sous_categories add column categorie_id uuid references public.boutique_categories(id);

update public.sous_categories sc
set categorie_id = c.id
from public.boutique_categories c
where c.boutique_id = sc.boutique_id
  and c.nom = case when sc.categorie = 'vetement' then 'Vêtements' else 'Accessoires' end;

alter table public.sous_categories alter column categorie_id set not null;
alter table public.sous_categories drop constraint sous_categories_categorie_check;
alter table public.sous_categories drop constraint sous_categories_boutique_id_categorie_nom_key;
alter table public.sous_categories drop column categorie;
alter table public.sous_categories add constraint sous_categories_boutique_id_categorie_id_nom_key
  unique (boutique_id, categorie_id, nom);
