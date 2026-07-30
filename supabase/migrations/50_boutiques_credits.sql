-- Ventes à crédit : un client peut repartir avec l'article sans tout payer
-- tout de suite. Le crédit est toujours lié à UNE vente (donc à ses produits
-- via vente_lignes, déjà en place) ET à UN client (clients_boutique) — jamais
-- l'un sans l'autre, comme demandé.
--
-- `credits` porte le solde global (montant dû, montant payé, échéance,
-- statut). `credit_paiements` journalise chaque versement partiel. Le statut
-- et le montant payé de `credits` sont recalculés automatiquement par
-- trigger à chaque paiement (même logique que fn_mouvement_stock /
-- tg_produits_sync_image_url : la vérité vit dans les lignes, l'agrégat est
-- dérivé). Le retard ("en_retard") n'est PAS stocké : c'est purement
-- date_echeance < aujourd'hui ET statut != 'paye', donc calculé à la volée
-- dans les requêtes de rapport plutôt que par un cron qui pourrait dériver.

alter table public.ventes drop constraint ventes_mode_paiement_check;
alter table public.ventes add constraint ventes_mode_paiement_check
  check (mode_paiement = any (array['cash','mobile_money','carte','paiement_livraison','credit']));

create table public.credits (
  id uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  vente_id uuid not null references public.ventes(id) on delete cascade,
  client_id uuid not null references public.clients_boutique(id),
  montant_total_usd numeric not null check (montant_total_usd >= 0),
  montant_paye_usd numeric not null default 0 check (montant_paye_usd >= 0),
  date_echeance date not null,
  statut text not null default 'en_attente' check (statut = any (array['en_attente','partiellement_paye','paye'])),
  created_at timestamptz not null default now(),
  unique (vente_id)
);

create index credits_boutique_idx on public.credits (boutique_id);
create index credits_client_idx on public.credits (client_id);
create index credits_statut_idx on public.credits (boutique_id, statut);

alter table public.credits enable row level security;

create policy "credits_staff_all"
  on public.credits for all
  using (is_boutique_staff(boutique_id, null))
  with check (is_boutique_staff(boutique_id, array['admin','vendeur','caissier']::boutique_role[]));

create table public.credit_paiements (
  id uuid primary key default gen_random_uuid(),
  credit_id uuid not null references public.credits(id) on delete cascade,
  boutique_id uuid not null references public.boutiques(id) on delete cascade,
  montant_usd numeric not null check (montant_usd > 0),
  mode_paiement text not null default 'cash' check (mode_paiement = any (array['cash','mobile_money','carte'])),
  encaisse_par uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index credit_paiements_credit_idx on public.credit_paiements (credit_id);
create index credit_paiements_boutique_idx on public.credit_paiements (boutique_id);

alter table public.credit_paiements enable row level security;

create policy "credit_paiements_staff_read"
  on public.credit_paiements for select
  using (is_boutique_staff(boutique_id, null));

create policy "credit_paiements_staff_insert"
  on public.credit_paiements for insert
  with check (is_boutique_staff(boutique_id, array['admin','vendeur','caissier']::boutique_role[]));

create function public.tg_credits_appliquer_paiement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_paye numeric;
begin
  update public.credits
  set montant_paye_usd = montant_paye_usd + new.montant_usd
  where id = new.credit_id
  returning montant_total_usd, montant_paye_usd into v_total, v_paye;

  update public.credits
  set statut = case
    when v_paye >= v_total then 'paye'
    when v_paye > 0 then 'partiellement_paye'
    else 'en_attente'
  end
  where id = new.credit_id;

  return new;
end;
$$;

create trigger credit_paiements_apres_insertion
  after insert on public.credit_paiements
  for each row execute function public.tg_credits_appliquer_paiement();
