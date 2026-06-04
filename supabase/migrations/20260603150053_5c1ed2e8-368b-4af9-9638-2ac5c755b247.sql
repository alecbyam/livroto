ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS callmebot_apikey TEXT;
ALTER TABLE public.riders ADD COLUMN IF NOT EXISTS callmebot_apikey TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS callmebot_apikey TEXT;