-- Slogan/tagline de la boutique (affiché sous le nom sur la vitrine, le
-- footer, la page de connexion, la facture et dans la meta description —
-- partout où l'identité de la boutique est mise en avant). Optionnel : NULL
-- par défaut, une boutique sans slogan configuré n'affiche simplement rien.
alter table public.boutiques add column slogan text;

update public.boutiques set slogan = 'You are a boss, dress like one'
where slug = 'hugo-collection';
