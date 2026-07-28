-- ============================================================================
-- LIVROTO — Boutiques : bucket de stockage privé pour les PDF de factures
--
-- Contrairement aux QR codes (public, migration 41), une facture est un
-- document plus sensible (montants, éventuellement coordonnées client) : le
-- bucket reste PRIVÉ (public=false). L'accès se fait exclusivement via une
-- URL signée longue durée (5 ans, même convention que uploadProductImage,
-- src/lib/image.ts) générée par service_role au moment du rendu du PDF —
-- aucune policy storage.objects n'est nécessaire pour la lecture puisque le
-- bucket privé bloque déjà tout accès direct hors signature.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('boutiques-factures', 'boutiques-factures', false)
ON CONFLICT (id) DO NOTHING;
