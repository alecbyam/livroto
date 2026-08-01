-- Référence produit lisible (ex: "REF-0001"), affichée partout où le QR
-- apparaît (table produits, caisse, étiquettes imprimées) — jusqu'ici seul
-- qr_code_data existait (`<boutique_id>:<produit_id>`, deux UUID), illisible
-- pour un humain qui scannerait/lirait l'étiquette hors de l'appli. Le QR
-- continue d'encoder boutique_id:produit_id (lookup fiable, inchangé) ; la
-- référence est un texte séparé affiché À CÔTÉ du QR pour l'identification
-- visuelle/manuelle (inventaire papier, communication fournisseur, etc).
alter table public.boutique_compteurs
  add column prochain_numero_produit integer not null default 1;

create or replace function public.fn_prochain_numero(p_boutique_id uuid, p_compteur text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_numero integer;
begin
  if p_compteur <> 'commande' and not (
    public.is_boutique_staff(p_boutique_id, null)
    or auth.role() = 'service_role'
    or current_setting('request.jwt.claims', true) is null
  ) then
    raise exception 'Non autorisé à générer un numéro pour cette boutique';
  end if;

  insert into public.boutique_compteurs (boutique_id) values (p_boutique_id)
  on conflict (boutique_id) do nothing;

  if p_compteur = 'vente' then
    update public.boutique_compteurs set prochain_numero_vente = prochain_numero_vente + 1
      where boutique_id = p_boutique_id returning prochain_numero_vente - 1 into v_numero;
  elsif p_compteur = 'facture' then
    update public.boutique_compteurs set prochain_numero_facture = prochain_numero_facture + 1
      where boutique_id = p_boutique_id returning prochain_numero_facture - 1 into v_numero;
  elsif p_compteur = 'commande' then
    update public.boutique_compteurs set prochain_numero_commande = prochain_numero_commande + 1
      where boutique_id = p_boutique_id returning prochain_numero_commande - 1 into v_numero;
  elsif p_compteur = 'bon_commande' then
    update public.boutique_compteurs set prochain_numero_bon_commande = prochain_numero_bon_commande + 1
      where boutique_id = p_boutique_id returning prochain_numero_bon_commande - 1 into v_numero;
  elsif p_compteur = 'produit' then
    update public.boutique_compteurs set prochain_numero_produit = prochain_numero_produit + 1
      where boutique_id = p_boutique_id returning prochain_numero_produit - 1 into v_numero;
  else
    raise exception 'Compteur inconnu: %', p_compteur;
  end if;

  return v_numero;
end;
$$;

alter table public.produits add column reference text;

create or replace function public.tg_produits_generer_reference()
returns trigger language plpgsql as $$
begin
  if new.reference is null then
    new.reference := 'REF-' || lpad(public.fn_prochain_numero(new.boutique_id, 'produit')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_produits_generer_reference before insert on public.produits
  for each row execute function public.tg_produits_generer_reference();

-- Backfill des produits déjà créés (avant ce trigger) — ordonné par
-- created_at pour que la numérotation reflète l'ordre réel de création.
do $$
declare
  r record;
begin
  for r in
    select id, boutique_id from public.produits where reference is null order by boutique_id, created_at
  loop
    update public.produits
      set reference = 'REF-' || lpad(public.fn_prochain_numero(r.boutique_id, 'produit')::text, 4, '0')
      where id = r.id;
  end loop;
end $$;

alter table public.produits add constraint produits_reference_boutique_unique unique (boutique_id, reference);
