# Moteur boutique multi-tenant marque blanche

Module ajouté à Livroto le 28/07 pour héberger des boutiques clientes en marque
blanche (Hugo Collection = première boutique). Isolation stricte par
`boutique_id` + RLS ; générique — rien de codé en dur pour Hugo Collection.

## Arborescence des routes

```
src/routes/
  boutique/
    route.tsx                  # layout racine : résout le tenant (Host ou ?boutique=slug),
                                # fournit <BoutiqueProvider>, override le head() marque blanche
    index.tsx                  # vitrine publique — catalogue
    panier.tsx                 # panier client (localStorage) + tunnel de commande
    admin/
      route.tsx                # layout backoffice : auth + vérif staff (is_boutique_staff)
      produits.tsx             # CRUD produits + QR code + planche d'étiquettes + ajustement de stock offline
      pos.tsx                  # caisse : scan QR (douchette/caméra) + recherche + offline (ventes)
      factures.tsx             # liste des factures, lien PDF
      fournisseurs.tsx         # fournisseurs + bons de commande + réception
      promo.tsx                # codes promo
      commandes.tsx            # commandes e-commerce entrantes + statut + livraison + bon de livraison
      parametres.tsx           # config intégrations (WhatsApp Business...)
      rapports.tsx             # CA, top/bas produits, usage codes promo, export CSV
```

**Espaces** (cf. cahier des charges) :
- `/boutique` = vitrine publique (aucune auth)
- `/boutique/admin/*` = backoffice (auth + staff de la boutique résolue)
- Espace `/compte` client (suivi de commande invité par numéro+téléphone) : **pas encore construit** — `boutiqueSuivreCommande` (serverFn) existe côté logique, il manque la page.

## ⚠️ Point d'architecture non résolu : domaine réel

Le préfixe `/boutique` est **temporaire**. TanStack Start n'a pas de
`middleware.ts` façon Next.js pour réécrire une requête AVANT que le routeur
fichier ne s'en empare — la résolution de tenant se fait donc dans le
`beforeLoad` du layout, qui a besoin d'un chemin littéral pour exister dans
l'arbre de routes. Deux tests infructueux avant d'arriver là :
- Un layout pathless `_boutique/index.tsx` entre en collision avec
  `routes/index.tsx` (l'accueil marketplace) — les deux mappent sur `/`.

**Quand un vrai domaine sera branché sur une boutique** (ex.
`hugocollection.cd` → CNAME/A record vers Railway), il faudra une réécriture
de requête au niveau serveur (hook Nitro/H3, avant le routeur TanStack) qui
détecte le Host et réécrit intern­ement le chemin vers `/boutique/...` — le
visiteur verra alors sa boutique à la racine `/` sans jamais voir `/boutique`
dans l'URL. Non implémenté : personne n'a encore de domaine réel à tester.

## Conventions de ce module (à respecter pour toute extension)

- Toute nouvelle table du module porte `boutique_id uuid references boutiques(id)`.
- RLS via `is_boutique_staff(boutique_id, roles[])` (SECURITY DEFINER, dans `31_boutiques_core.sql`) — jamais une vérification de rôle dupliquée en dur.
- Toute variation de stock passe par `fn_mouvement_stock()` — un trigger bloque physiquement les `UPDATE` directs de `produits.quantite`.
- Numérotation séquentielle par boutique via `fn_prochain_numero(boutique_id, 'vente'|'facture'|'commande'|'bon_commande')`.
- **Piège Supabase** : `REVOKE EXECUTE ... FROM PUBLIC` ne retire PAS l'accès `anon` (privilèges par défaut du projet). Toujours `REVOKE ... FROM anon` explicitement pour fermer une fonction sensible — vérifier avec `select * from information_schema.routine_privileges where routine_name='...'`.
- **Piège RLS** : `INSERT ... RETURNING` déclenche l'évaluation des policies SELECT, pas seulement INSERT. Un insert anon direct avec `RETURNING` échoue s'il n'y a pas de policy SELECT pour `anon` — d'où le choix de tout le checkout e-commerce et POS en service_role (`supabaseAdmin`) depuis des serverFn, jamais un insert direct depuis le navigateur.
- Prix TOUJOURS recalculés côté serveur au moment de la vente/commande — jamais acceptés tels quels du panier client.

## Impression des reçus (ESC/POS)

Base : **ESC/POS** (standard de fait, ~90% des imprimantes thermiques de commerce). Module dans `src/lib/boutiques/impression/` :
- `escpos.ts` : générateur de commandes brutes (init, alignement, gras, double taille, coupe papier) + mise en page du reçu aux largeurs 58 mm (32 colonnes) et 80 mm (48 colonnes). Accents translittérés en ASCII (les imprimantes bon marché gèrent mal les code pages — un reçu lisible partout vaut mieux que des symboles aléatoires).
- `imprimante.ts` : transports + config PAR TERMINAL (localStorage — chaque caisse a sa propre imprimante, ce n'est pas une propriété de la boutique) :
  - **USB** : WebUSB (Chrome/Edge desktop + Android), endpoint bulk-out auto-détecté, périphérique mémorisé entre deux impressions.
  - **Bluetooth** : Web Bluetooth, services GATT des thermiques courantes (18F0/2AF1, FFE0, E7810A71…), écriture par paquets de 120 octets. Le cas le plus fréquent à Bunia (thermiques 58 mm chinoises).
  - **Wi-Fi/Ethernet** : ❌ impossible depuis un navigateur (pas de socket TCP brut vers le port 9100). Option documentée dans l'UI comme "à venir avec l'app native" — le repo a déjà Capacitor (android/ios), un plugin natif pourra combler ça. En attendant, une imprimante réseau installée dans l'OS fonctionne via le mode "Imprimante système".
  - **Imprimante système / PDF** : `window.print()` avec reçu HTML stylé `@page` à la largeur choisie (58/80 mm ou A4) — fonctionne avec toute imprimante installée (pilote Windows/Android, y compris thermiques) et couvre "imprimer en PDF". Fallback universel + mode par défaut.
- `ConfigImpressionDialog.tsx` : bouton "Imprimante" dans la caisse — type (ESC/POS / système), connexion (Bluetooth / USB), papier (58/80/A4), bouton "reçu de test" réel.
- Intégration POS : reçu imprimé automatiquement après chaque encaissement (en ligne : numéro + total serveur avec remise ; hors ligne : reçu sans numéro, marqué "à synchroniser"). Best-effort — une imprimante en panne ne bloque jamais la vente.

## Mode hors ligne (gestion de boutique, pas seulement la caisse)

Deux files d'attente localStorage distinctes, même pattern anti-zombie (5 tentatives max) :
- `pos-offline-queue.ts` : ventes encaissées hors ligne.
- `stock-offline-queue.ts` : ajustements de stock manuels (`produits.tsx`, boutons +1/-1) — un gérant peut compter/corriger son stock sans réseau ; l'affichage du stock est "optimiste" (valeur serveur + deltas en attente) tant que la synchro n'a pas eu lieu.

Non couvert par ce mode hors ligne : navigation dans le catalogue/les rapports/etc. sans AUCUNE donnée déjà chargée (pas de miroir local des données en lecture, seulement les écritures POS/stock sont mises en file). Le service worker existant (`public/sw.js`) met déjà en cache les assets statiques (JS/CSS/images) automatiquement après une première visite, donc l'app elle-même se charge hors ligne — seules les données fraîches nécessitent le réseau.

## Limites connues / à traiter avant une mise en prod réelle

1. **Survente possible** : le stock d'une commande e-commerce n'est décrémenté qu'à la confirmation (pas à la création) — deux clients peuvent commander la dernière pièce avant qu'une seule confirmation ne passe. Choix aligné sur le comportement marketplace existant.
2. **Livraison** : pas de transporteur externe (correction utilisateur du 28/07 — "HM Logistics" était une hypothèse erronée). Deux modes gérés dans `livraisons.functions.ts`/`commandes.tsx` : `juntox_livroto` (JuntoX livre via le réseau de livreurs Livroto existant — assignation d'un `rider_id` réel depuis la table `riders`) ou `boutique` (la boutique cliente livre elle-même, suivi de statut manuel uniquement). Aucune API tierce.
3. **Manifest PWA** (`manifest.webmanifest`) : pas encore dynamique par boutique — une boutique installée en PWA afficherait "Livroto" comme nom d'app.
4. **Panier** : stocké en `localStorage` uniquement (pas la table `panier`, conçue pour ça mais non câblée) — pas de synchro multi-appareil, et donc **pas de rappel de panier abandonné possible** (le serveur ne voit jamais un panier avant le checkout). Pour activer cette fonctionnalité demandée au cahier des charges, il faudrait : synchroniser le panier vers la table `panier` à chaque changement (best-effort), puis un job planifié (pg_cron + pg_net, ou scheduler externe) scannant les paniers inactifs depuis N heures.
5. **Marge par article** (rapports) : pas de coût unitaire stocké sur `produits` — seul `bon_commande_lignes.prix_achat_unitaire_usd` existe (capturé à la réception). Le rapport actuel donne le chiffre d'affaires par produit, pas la marge (nécessiterait de dériver un coût moyen pondéré par produit).
6. **Espace `/compte` client** : pas construit (suivi de commande invité existe côté serveur, pas de page).

## Checklist : ajouter une nouvelle boutique cliente

1. Créer la ligne `boutiques` (slug, nom, devise, coordonnées légales — adresse/telephone/email/rccm/id_national). Le `domaine` peut rester NULL tant que le DNS n'est pas branché (accès via `?boutique=<slug>` en attendant).
2. Définir le `theme` (jsonb) — au minimum `primary`/`accent`, et fournir un `logo_url` réel (upload dans un bucket, ou URL externe).
3. Demander à la personne qui gérera la boutique de créer un compte via `/auth` (flux normal Livroto — même table `auth.users`).
4. L'attacher comme staff : `insert into boutique_users (boutique_id, user_id, role) values ('<id>', '<user_id>', 'admin')`.
5. Configurer WhatsApp Business (`/boutique/admin/parametres`, ou directement `boutique_integration_settings`) si la boutique veut des notifications automatiques.
6. Une fois un vrai domaine disponible : le pointer vers Railway, puis mettre à jour `boutiques.domaine` — et prévoir le travail de réécriture Nitro/H3 mentionné plus haut pour servir la boutique à la racine `/` sans préfixe.
7. Saisir le catalogue initial (ou l'importer) : chaque produit génère automatiquement son `qr_code_data` ; lancer `scripts/generer-qr-produits.mjs <boutique_id>` pour produire les images QR en lot.
