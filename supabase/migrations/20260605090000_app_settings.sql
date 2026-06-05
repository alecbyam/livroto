-- Paramètres applicatifs clé/valeur (taux de change CDF, etc.)
-- Lecture publique (le taux USD→CDF est affiché avant connexion sur le catalogue),
-- écriture réservée aux admins.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Taux de change par défaut : 1 USD = 2800 CDF (ajustable par un admin)
INSERT INTO public.app_settings (key, value, description)
VALUES ('cdf_rate', '2800', 'Taux de change : 1 USD = X CDF (Franc Congolais)')
ON CONFLICT (key) DO NOTHING;

GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_public_read ON public.app_settings;
CREATE POLICY app_settings_public_read ON public.app_settings
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS app_settings_admin_write ON public.app_settings;
CREATE POLICY app_settings_admin_write ON public.app_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));
