INSERT INTO public.user_roles (user_id, role) VALUES ('85fd37a8-56fc-44c9-848c-f1377bbf96b8','admin') ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES ('85fd37a8-56fc-44c9-848c-f1377bbf96b8','vendor') ON CONFLICT DO NOTHING;

-- Seed default zones if empty
INSERT INTO public.zones (name, delivery_fee_usd) 
SELECT * FROM (VALUES 
  ('Centre-ville', 1.5),
  ('Mudzipela', 2.0),
  ('Lumumba', 2.0),
  ('Saio', 2.5),
  ('Nyakasanza', 2.5),
  ('Rwambuzi', 3.0)
) AS v(name, fee)
WHERE NOT EXISTS (SELECT 1 FROM public.zones);