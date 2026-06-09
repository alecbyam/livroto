-- ============================================================================
-- LIVROTO — Intégrations FlexPay (paiement RDC) + WhatsApp Cloud API
-- ============================================================================

-- 1) Stockage SÉCURISÉ de la config/secrets des intégrations.
--    RLS activé SANS aucune policy => les rôles anon/authenticated n'ont
--    AUCUN accès. Seul service_role (serveur) lit/écrit (il bypass RLS).
--    Les secrets ne quittent donc jamais le serveur.
create table if not exists public.integration_settings (
  key         text primary key,
  value       text,
  is_secret   boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
alter table public.integration_settings enable row level security;

comment on table public.integration_settings is
  'Config/secrets des intégrations tierces (FlexPay, WhatsApp Cloud). Accessible UNIQUEMENT via service_role côté serveur. Ne jamais exposer au client.';

-- 2) Enrichissement de payments pour le suivi passerelle (additif, nullable => sûr)
alter table public.payments add column if not exists provider        text;   -- ex: 'flexpay'
alter table public.payments add column if not exists provider_status text;   -- statut brut renvoyé par la passerelle
alter table public.payments add column if not exists phone           text;   -- numéro mobile money débité
alter table public.payments add column if not exists currency        text;   -- 'USD' | 'CDF'
alter table public.payments add column if not exists raw             jsonb;  -- payload brut (audit/debug)

-- 3) Flags publics on/off (app_settings est lisible par anon) : permettent au
--    checkout de savoir s'il doit proposer FlexPay — SANS exposer de secret.
insert into public.app_settings(key, value) values
  ('flexpay_enabled',  'false'),
  ('whatsapp_enabled', 'false')
on conflict (key) do nothing;

-- 4) Squelette de config (valeurs non secrètes par défaut, secrets vides).
--    L'admin remplira ces champs via l'interface dédiée.
insert into public.integration_settings(key, value, is_secret) values
  -- FlexPay
  ('flexpay_base_url',          'https://backend.flexpay.cd/api/rest/v1', false),
  ('flexpay_merchant',          '',     false),
  ('flexpay_token',             '',     true),
  ('flexpay_currency',          'CDF',  false),
  ('flexpay_callback_url',      '',     false),
  -- WhatsApp Cloud API (Meta)
  ('whatsapp_base_url',         'https://graph.facebook.com/v21.0', false),
  ('whatsapp_phone_number_id',  '',     false),
  ('whatsapp_token',            '',     true),
  ('whatsapp_business_id',      '',     false),
  ('whatsapp_verify_token',     '',     false),
  ('whatsapp_app_secret',       '',     true),
  ('whatsapp_lang',             'fr',   false)
on conflict (key) do nothing;
