-- ============================================================================
-- LIVROTO — Test d'isolation RLS du module boutiques (multi-tenant)
--
-- But : prouver qu'un membre du staff d'une boutique ne peut JAMAIS lire les
-- données (fournisseurs, ventes, etc.) d'une autre boutique, et qu'un
-- utilisateur sans rattachement (boutique_users) ne voit rien du tout.
--
-- À exécuter via l'éditeur SQL Supabase (ou `mcp__claude_ai_Supabase__execute_sql`)
-- sur le projet cible. Chaque bloc est autonome ; les fixtures sont nettoyées
-- à la fin (rien ne persiste). Remplacer les deux UUID auth.users ci-dessous
-- par deux comptes existants du projet (n'importe lesquels : ce script ne
-- modifie jamais auth.users, seulement des rattachements boutique_users
-- éphémères).
--
-- Technique : Supabase route les requêtes PostgREST via les rôles Postgres
-- `anon`/`authenticated`, avec l'identité portée par la GUC de session
-- `request.jwt.claims` (lue par auth.uid()). On simule cela avec
-- `SET ROLE ...` + `SELECT set_config('request.jwt.claims', '{"sub":"..."}', false)`
-- pour obtenir un enforcement RLS réel (le rôle `postgres`/superuser
-- bypasserait sinon complètement la RLS).
-- ============================================================================

-- --- Fixtures ---------------------------------------------------------------
INSERT INTO public.boutiques (id, slug, nom, actif) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'test-isolation-a', 'Test Isolation A', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'test-isolation-b', 'Test Isolation B', true)
ON CONFLICT (id) DO NOTHING;

-- Remplacer par deux uuid réels de auth.users (`select id from auth.users limit 2`).
INSERT INTO public.boutique_users (boutique_id, user_id, role) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '<uuid_user_1>', 'admin'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '<uuid_user_2>', 'admin')
ON CONFLICT (boutique_id, user_id) DO NOTHING;

INSERT INTO public.fournisseurs (id, boutique_id, nom) VALUES
  ('aaaaaaa1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Fournisseur secret A'),
  ('bbbbbbb1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Fournisseur secret B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ventes (id, boutique_id, mode_paiement, total_usd) VALUES
  ('aaaaaaa2-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cash', 100.00),
  ('bbbbbbb2-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cash', 200.00)
ON CONFLICT (id) DO NOTHING;

-- --- Scénario 1 : user1 (staff EXCLUSIF de A) --------------------------------
-- Attendu : staff_a=true, staff_b=false, ne voit QUE le fournisseur/la vente A.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<uuid_user_1>","role":"authenticated"}', false);
SELECT
  is_boutique_staff('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, NULL) AS staff_a,
  is_boutique_staff('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, NULL) AS staff_b,
  (SELECT array_agg(nom) FROM public.fournisseurs WHERE id IN ('aaaaaaa1-0000-0000-0000-000000000001','bbbbbbb1-0000-0000-0000-000000000001')) AS fournisseurs_visibles,
  (SELECT array_agg(id) FROM public.ventes WHERE id IN ('aaaaaaa2-0000-0000-0000-000000000002','bbbbbbb2-0000-0000-0000-000000000002')) AS ventes_visibles;
RESET ROLE;
RESET request.jwt.claims;

-- --- Scénario 2 : user2 (staff EXCLUSIF de B) --------------------------------
-- Attendu : symétrique du scénario 1.
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"<uuid_user_2>","role":"authenticated"}', false);
SELECT
  is_boutique_staff('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, NULL) AS staff_a,
  is_boutique_staff('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, NULL) AS staff_b,
  (SELECT array_agg(nom) FROM public.fournisseurs WHERE id IN ('aaaaaaa1-0000-0000-0000-000000000001','bbbbbbb1-0000-0000-0000-000000000001')) AS fournisseurs_visibles,
  (SELECT array_agg(id) FROM public.ventes WHERE id IN ('aaaaaaa2-0000-0000-0000-000000000002','bbbbbbb2-0000-0000-0000-000000000002')) AS ventes_visibles;
RESET ROLE;
RESET request.jwt.claims;

-- --- Scénario 3 : utilisateur authentifié SANS aucun rattachement -----------
-- Attendu : tout à false/0 (ni A ni B, même en étant "authenticated").
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', false);
SELECT
  is_boutique_staff('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, NULL) AS staff_a,
  is_boutique_staff('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, NULL) AS staff_b,
  (SELECT count(*) FROM public.fournisseurs WHERE id IN ('aaaaaaa1-0000-0000-0000-000000000001','bbbbbbb1-0000-0000-0000-000000000001')) AS nb_fournisseurs_visibles,
  (SELECT count(*) FROM public.ventes WHERE id IN ('aaaaaaa2-0000-0000-0000-000000000002','bbbbbbb2-0000-0000-0000-000000000002')) AS nb_ventes_visibles;
RESET ROLE;
RESET request.jwt.claims;

-- --- Scénario 4 : anon (visiteur non authentifié) ---------------------------
-- Attendu : ne voit ni fournisseurs ni clients_boutique des autres.
SET ROLE anon;
SELECT
  (SELECT count(*) FROM public.fournisseurs) AS nb_fournisseurs_visibles,
  (SELECT count(*) FROM public.clients_boutique) AS nb_clients_visibles;
RESET ROLE;

-- --- Nettoyage ---------------------------------------------------------------
RESET ROLE;
DELETE FROM public.ventes WHERE boutique_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
DELETE FROM public.fournisseurs WHERE boutique_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
DELETE FROM public.boutique_users WHERE boutique_id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
DELETE FROM public.boutiques WHERE id IN ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

-- ============================================================================
-- Résultat obtenu en exécution réelle (2026-07-28, projet LIVROTO-Frankfurt) :
--   user1 : staff_a=true,  staff_b=false, fournisseurs_visibles={A}, ventes_visibles={A}
--   user2 : staff_a=false, staff_b=true,  fournisseurs_visibles={B}, ventes_visibles={B}
--   random authenticated : staff_a=false, staff_b=false, 0 fournisseur, 0 vente
--   anon : 0 fournisseur, 0 client_boutique
-- -> isolation confirmée sur les deux styles de policy (colonne directe
--    boutique_id, et jointure EXISTS via une table parente).
-- ============================================================================
