-- Adresses de livraison sauvegardées par l'utilisateur (réutilisables au checkout).
-- À Bunia, les adresses sont informelles → on garde un repère (landmark) en plus du
-- texte libre et du GPS. Objectif UX : moins de saisie à chaque commande.

CREATE TABLE IF NOT EXISTS public.saved_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,                 -- ex : « Maison », « Boutique », « Chez maman »
  address text NOT NULL,               -- description / rue / quartier en texte libre
  landmark text,                       -- repère : « après l'église CBCA Mudzipela »
  zone_id uuid REFERENCES public.zones(id) ON DELETE SET NULL,
  lat numeric(9,6),
  lng numeric(9,6),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_addresses_user_idx ON public.saved_addresses(user_id);

GRANT ALL ON public.saved_addresses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_addresses TO authenticated;

ALTER TABLE public.saved_addresses ENABLE ROW LEVEL SECURITY;

-- Chaque utilisateur ne voit et ne gère QUE ses propres adresses.
-- (select auth.uid()) : forme optimisée par le planificateur (cf. migration 25).
DROP POLICY IF EXISTS saved_addresses_owner_all ON public.saved_addresses;
CREATE POLICY saved_addresses_owner_all ON public.saved_addresses
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
