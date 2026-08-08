-- La facture est auto-créée par tg_ventes_generer_facture au moment de
-- l'INSERT sur ventes, avec factures.created_at par défaut à now() —
-- indépendant de ventes.created_at. Depuis l'ajout du champ "Date et heure"
-- au POS (date_vente, permettant d'enregistrer une vente à une date/heure
-- réelle différente du moment de la saisie — ex. vente papier saisie plus
-- tard, ou vente hors-ligne resynchronisée), la facture devait reprendre
-- cette même date : sinon la facture PDF et la liste des factures
-- affichaient toujours l'heure de génération plutôt que l'heure réelle de
-- la vente, même quand ventes.created_at était correctement backdaté.
create or replace function public.tg_ventes_generer_facture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'validee' then
    insert into public.factures (boutique_id, vente_id, created_at)
    values (new.boutique_id, new.id, new.created_at)
    on conflict (vente_id) do nothing;
  end if;
  return new;
end;
$$;

-- Rattrapage des factures déjà générées avec un created_at divergent de
-- leur vente (toutes celles créées avant ce fix) — sans ça, seules les
-- NOUVELLES factures bénéficieraient de la correction.
update public.factures f
set created_at = v.created_at
from public.ventes v
where f.vente_id = v.id
  and f.created_at <> v.created_at;
