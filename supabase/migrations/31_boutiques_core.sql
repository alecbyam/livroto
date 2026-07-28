-- ============================================================================
-- LIVROTO — Moteur boutique multi-tenant marque blanche (fondations)
--
-- Une "boutique" ici est un client marque blanche autonome (ex. Hugo
-- Collection) avec son propre domaine, sa propre facturation, son propre
-- stock — PAS un vendeur listé dans le catalogue marketplace existant
-- (vendors/products/orders). D'où des tables et un espace de noms distincts
-- (français, préfixés par le concept "boutique"), pour ne jamais mélanger les
-- deux modèles de données ni leurs politiques RLS.
--
-- Isolation : chaque table de ce module porte une colonne boutique_id, et
-- toutes les policies RLS filtrent dessus via la fonction is_boutique_staff()
-- définie plus bas. Aucune donnée n'est jamais accessible en dehors de sa
-- boutique — vérifié par le script de test d'isolation
-- (scripts/test-isolation-boutiques.sql).
-- ============================================================================

-- 1) Rôles internes à une boutique (distinct de app_role, le rôle global
--    marketplace). Un même utilisateur peut avoir des rôles différents dans
--    deux boutiques clientes différentes.
DO $$ BEGIN
  CREATE TYPE public.boutique_role AS ENUM ('admin', 'vendeur', 'caissier');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2) Boutiques (tenants marque blanche) -------------------------------------
CREATE TABLE IF NOT EXISTS public.boutiques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,          -- ex: 'hugo-collection' (fallback routing / sous-domaine par défaut)
  domaine text UNIQUE,                -- ex: 'boutique.hugocollection.cd' — NULL tant que le domaine n'est pas branché
  nom text NOT NULL,                  -- ex: 'Hugo Collection'
  logo_url text,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,   -- couleurs/police, ex {"primary":"#..","accent":"#.."}
  devise text NOT NULL DEFAULT 'USD',
  adresse text,
  telephone text,
  email text,
  rccm text,                          -- registre de commerce (mentions légales RDC sur factures)
  id_national text,                   -- identifiant national (mentions légales RDC)
  actif boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS boutiques_domaine_idx ON public.boutiques(domaine) WHERE domaine IS NOT NULL;

GRANT SELECT ON public.boutiques TO anon, authenticated;
GRANT ALL ON public.boutiques TO service_role;
ALTER TABLE public.boutiques ENABLE ROW LEVEL SECURITY;
-- Policies ajoutées plus bas, après la définition de is_boutique_staff().

-- 3) Équipe d'une boutique ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.boutique_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.boutique_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (boutique_id, user_id)
);

CREATE INDEX IF NOT EXISTS boutique_users_user_idx ON public.boutique_users(user_id);

GRANT SELECT ON public.boutique_users TO authenticated;
GRANT ALL ON public.boutique_users TO service_role;
ALTER TABLE public.boutique_users ENABLE ROW LEVEL SECURITY;
-- Policies ajoutées plus bas.

-- 4) Fonction pivot : appartenance au staff d'une boutique -------------------
-- SECURITY DEFINER (comme has_role() dans la migration initiale) : la
-- fonction s'exécute avec les privilèges de son propriétaire (postgres),
-- qui bypass RLS -> pas de récursion, même utilisée depuis la policy de
-- boutique_users elle-même.
CREATE OR REPLACE FUNCTION public.is_boutique_staff(p_boutique_id uuid, p_roles public.boutique_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boutique_users bu
    WHERE bu.boutique_id = p_boutique_id
      AND bu.user_id = (select auth.uid())
      AND (p_roles IS NULL OR bu.role = ANY(p_roles))
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_boutique_staff(uuid, public.boutique_role[]) TO authenticated;

-- 5) Policies boutiques -------------------------------------------------------
-- Aucune donnée secrète dans cette table (les identifiants/clés API vivent
-- dans boutique_integration_settings, service_role uniquement) : la lecture
-- publique est nécessaire pour que le middleware de résolution de tenant et
-- la vitrine publique chargent logo/thème/coordonnées SANS session.
CREATE POLICY boutiques_public_read ON public.boutiques
  FOR SELECT TO anon, authenticated USING (actif = true);

-- Le staff voit sa boutique même désactivée (ex: pendant l'onboarding, avant
-- mise en ligne officielle).
CREATE POLICY boutiques_staff_read ON public.boutiques
  FOR SELECT TO authenticated USING (public.is_boutique_staff(id, NULL));

-- Création de tenant, changement de domaine/slug : réservé à l'exploitant de
-- la plateforme (rôle global admin), jamais au staff d'une boutique cliente —
-- un changement de domaine mal maîtrisé casserait le routing de TOUTES les
-- boutiques. Le formulaire d'admin boutique ne doit tout simplement jamais
-- exposer ces deux champs (contrôle applicatif en complément de celui-ci).
CREATE POLICY boutiques_platform_admin_all ON public.boutiques
  FOR ALL TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'::app_role))
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::app_role));

CREATE TRIGGER boutiques_set_updated_at BEFORE UPDATE ON public.boutiques
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 6) Policies boutique_users --------------------------------------------------
-- Un membre du staff voit ses propres rattachements (pour savoir à quelles
-- boutiques il a accès et avec quel rôle) — comparaison directe sur user_id,
-- SANS passer par is_boutique_staff(), par simplicité pour la policy la plus
-- fréquemment évaluée de cette table.
CREATE POLICY boutique_users_self_read ON public.boutique_users
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

-- Gestion de l'équipe (ajout/retrait/changement de rôle) : réservé aux admins
-- DE LA boutique concernée, ou à l'admin plateforme (onboarding initial d'une
-- nouvelle boutique cliente).
CREATE POLICY boutique_users_admin_manage ON public.boutique_users
  FOR ALL TO authenticated
  USING (
    public.is_boutique_staff(boutique_id, ARRAY['admin']::public.boutique_role[])
    OR public.has_role((select auth.uid()), 'admin'::app_role)
  )
  WITH CHECK (
    public.is_boutique_staff(boutique_id, ARRAY['admin']::public.boutique_role[])
    OR public.has_role((select auth.uid()), 'admin'::app_role)
  );

-- 7) Clients d'une boutique (comptes e-commerce + clients invités) -----------
CREATE TABLE IF NOT EXISTS public.clients_boutique (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL = client invité (checkout sans compte)
  nom text NOT NULL,
  telephone text NOT NULL,
  email text,
  adresse_defaut text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_boutique_user_uniq
  ON public.clients_boutique(boutique_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS clients_boutique_boutique_idx ON public.clients_boutique(boutique_id);
CREATE INDEX IF NOT EXISTS clients_boutique_telephone_idx ON public.clients_boutique(boutique_id, telephone);

GRANT INSERT ON public.clients_boutique TO anon;
GRANT SELECT, INSERT, UPDATE ON public.clients_boutique TO authenticated;
GRANT ALL ON public.clients_boutique TO service_role;
ALTER TABLE public.clients_boutique ENABLE ROW LEVEL SECURITY;

-- Un client connecté ne voit/modifie que sa propre fiche.
CREATE POLICY clients_boutique_self_all ON public.clients_boutique
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- Checkout invité (anon) : autorisé à CRÉER sa fiche (user_id NULL
-- uniquement), jamais à lire les fiches des autres clients — il n'existe
-- aucune policy SELECT pour le rôle anon, donc un invité ne peut pas
-- énumérer les clients de la boutique.
CREATE POLICY clients_boutique_guest_insert ON public.clients_boutique
  FOR INSERT TO anon WITH CHECK (user_id IS NULL);

-- Le staff de la boutique gère tous ses clients (service client, saisie
-- manuelle d'une commande au comptoir, etc.)
CREATE POLICY clients_boutique_staff_all ON public.clients_boutique
  FOR ALL TO authenticated
  USING (public.is_boutique_staff(boutique_id, NULL))
  WITH CHECK (public.is_boutique_staff(boutique_id, NULL));

CREATE TRIGGER clients_boutique_set_updated_at BEFORE UPDATE ON public.clients_boutique
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 8) Numérotation séquentielle PAR boutique -----------------------------------
-- Une séquence Postgres classique (CREATE SEQUENCE) est globale : elle ne
-- peut pas repartir de 1 pour chaque nouvelle boutique cliente. On utilise
-- donc un compteur par tenant, incrémenté atomiquement (verrouillage de ligne
-- via l'UPDATE ci-dessous), exposé UNIQUEMENT par fn_prochain_numero().
CREATE TABLE IF NOT EXISTS public.boutique_compteurs (
  boutique_id uuid PRIMARY KEY REFERENCES public.boutiques(id) ON DELETE CASCADE,
  prochain_numero_vente integer NOT NULL DEFAULT 1,
  prochain_numero_facture integer NOT NULL DEFAULT 1,
  prochain_numero_commande integer NOT NULL DEFAULT 1,
  prochain_numero_bon_commande integer NOT NULL DEFAULT 1
);

GRANT ALL ON public.boutique_compteurs TO service_role;
GRANT SELECT ON public.boutique_compteurs TO authenticated;
ALTER TABLE public.boutique_compteurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY boutique_compteurs_staff_read ON public.boutique_compteurs
  FOR SELECT TO authenticated USING (public.is_boutique_staff(boutique_id, NULL));
-- Pas de policy INSERT/UPDATE pour authenticated : les compteurs ne sont
-- incrémentés QUE via fn_prochain_numero() (SECURITY DEFINER), jamais en
-- écriture directe, pour garantir l'unicité stricte de la séquence même sous
-- forte concurrence (plusieurs caisses qui encaissent en même temps).

CREATE OR REPLACE FUNCTION public.fn_prochain_numero(p_boutique_id uuid, p_compteur text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_numero integer;
BEGIN
  INSERT INTO public.boutique_compteurs (boutique_id) VALUES (p_boutique_id)
  ON CONFLICT (boutique_id) DO NOTHING;

  IF p_compteur = 'vente' THEN
    UPDATE public.boutique_compteurs SET prochain_numero_vente = prochain_numero_vente + 1
      WHERE boutique_id = p_boutique_id RETURNING prochain_numero_vente - 1 INTO v_numero;
  ELSIF p_compteur = 'facture' THEN
    UPDATE public.boutique_compteurs SET prochain_numero_facture = prochain_numero_facture + 1
      WHERE boutique_id = p_boutique_id RETURNING prochain_numero_facture - 1 INTO v_numero;
  ELSIF p_compteur = 'commande' THEN
    UPDATE public.boutique_compteurs SET prochain_numero_commande = prochain_numero_commande + 1
      WHERE boutique_id = p_boutique_id RETURNING prochain_numero_commande - 1 INTO v_numero;
  ELSIF p_compteur = 'bon_commande' THEN
    UPDATE public.boutique_compteurs SET prochain_numero_bon_commande = prochain_numero_bon_commande + 1
      WHERE boutique_id = p_boutique_id RETURNING prochain_numero_bon_commande - 1 INTO v_numero;
  ELSE
    RAISE EXCEPTION 'Compteur inconnu: %', p_compteur;
  END IF;

  RETURN v_numero;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_prochain_numero(uuid, text) TO authenticated, service_role;

-- 9) Secrets d'intégration PAR boutique ---------------------------------------
-- Même principe que public.integration_settings (migration 26) : RLS activé
-- SANS aucune policy => anon/authenticated n'ont AUCUN accès, même en
-- lecture. Seul service_role (code serveur) lit/écrit. Chaque boutique a ses
-- propres identifiants (numéro WhatsApp Business, clé API HM Logistics) sans
-- jamais voir ceux des autres boutiques clientes.
CREATE TABLE IF NOT EXISTS public.boutique_integration_settings (
  boutique_id uuid NOT NULL REFERENCES public.boutiques(id) ON DELETE CASCADE,
  key text NOT NULL,             -- ex: 'whatsapp_phone_number_id', 'whatsapp_token', 'hm_logistics_api_key'
  value text,
  is_secret boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (boutique_id, key)
);

ALTER TABLE public.boutique_integration_settings ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.boutique_integration_settings IS
  'Config/secrets par boutique (WhatsApp Business, HM Logistics...). Accessible UNIQUEMENT via service_role côté serveur, jamais exposé au client.';

GRANT ALL ON public.boutique_integration_settings TO service_role;
