-- Mobile Money du vendeur (affiché au client qui paie par M-Pesa / Airtel / Orange Money)
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS mobile_money_number text,
  ADD COLUMN IF NOT EXISTS mobile_money_name text;
