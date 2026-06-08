-- Position GPS du client pour la livraison (le livreur obtient un itinéraire précis)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS customer_lng numeric(9,6);
