-- boutique_categories et sous_categories n'avaient qu'une policy de lecture
-- staff ("boutique_categories_staff_read"/"sous_categories_staff_read",
-- is_boutique_staff) — jamais de lecture publique. Résultat : le storefront
-- (visiteur anonyme, client anon) ne pouvait voir NI les pastilles de
-- catégorie NI le nom de la sous-catégorie affichée sur chaque produit —
-- silencieusement null côté anon, jamais une erreur visible. Même pattern que
-- `produits_public_read` (migration 33) : actif + boutique active, lecture
-- ouverte à anon ET authenticated (un client connecté au marketplace qui
-- visite une boutique n'a pas de rôle staff pour autant).
create policy "boutique_categories_public_read"
  on public.boutique_categories for select
  to anon, authenticated
  using (
    actif = true
    and exists (select 1 from public.boutiques b where b.id = boutique_categories.boutique_id and b.actif = true)
  );

create policy "sous_categories_public_read"
  on public.sous_categories for select
  to anon, authenticated
  using (
    actif = true
    and exists (select 1 from public.boutiques b where b.id = sous_categories.boutique_id and b.actif = true)
  );
