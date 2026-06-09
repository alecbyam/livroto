# Intégrations LIVROTO — FlexPay & WhatsApp Cloud API

> Tout est déjà codé et déployé. Les intégrations sont **dormantes** (désactivées)
> tant que tu n'as pas collé les identifiants dans l'admin. Aucun risque en production.

## Où configurer
Dashboard → onglet **Admin** → section **« Intégrations & API »**.
Les secrets sont stockés côté serveur (table `integration_settings`, accessible
uniquement par le serveur) et **ne sont jamais réaffichés en clair**.

---

## 1) FlexPay (paiement Mobile Money RDC)

Quand tu recevras tes accès FlexPay, remplis dans l'admin :

| Champ | Valeur |
|---|---|
| **Code marchand (merchant)** | Ton code marchand FlexPay |
| **Token API** | Le token (Bearer) fourni par FlexPay |
| **Devise de débit** | `CDF` (conseillé à Bunia) ou `USD` |
| **URL de base de l'API** | Pré-rempli : `https://backend.flexpay.cd/api/rest/v1` (à ajuster si FlexPay t'en donne une autre) |
| **URL de callback** | Clique « Utiliser l'URL recommandée » → `https://joaepnfhhewadcklsquk.supabase.co/functions/v1/flexpay-callback` |

Étapes :
1. Colle merchant + token, choisis la devise.
2. Mets l'URL de callback **aussi dans ton dashboard FlexPay** (côté FlexPay).
3. Clique **Enregistrer**, puis **Tester la connexion**.
4. Active le switch **Actif**.

Dès que c'est actif, au checkout, si le client choisit M-Pesa / Airtel / Orange
(commande mono-vendeur), il reçoit un **push USSD** et le paiement est suivi en
direct. Confirmation via le webhook **et** un polling de secours (double sécurité).

---

## 2) WhatsApp Cloud API (notifications automatiques)

Depuis Meta (developers.facebook.com → ton app WhatsApp), récupère :

| Champ admin | Où le trouver chez Meta |
|---|---|
| **Phone Number ID** | WhatsApp → API Setup |
| **Access Token** | Token **permanent** (System User recommandé) |
| **WhatsApp Business Account ID** | WhatsApp → API Setup (optionnel) |
| **App Secret** | App → Paramètres → Général (optionnel, pour signer le webhook) |
| **Verify Token** | Une chaîne secrète **que tu inventes** (ex: `livroto-2026-xyz`) |
| **Langue des templates** | `fr` |

Configurer le webhook côté Meta :
1. Dans l'admin LIVROTO, mets un **Verify Token** et **Enregistre**.
2. Copie l'**URL du webhook** : `https://joaepnfhhewadcklsquk.supabase.co/functions/v1/whatsapp-webhook`
3. Chez Meta → WhatsApp → Configuration → Webhook : colle l'URL + le **même** Verify Token,
   puis « Vérifier et enregistrer » (Meta appelle notre endpoint, qui répond au handshake).
4. Abonne-toi au champ `messages`.
5. Dans l'admin LIVROTO : **Tester la connexion** (vérifie le token + le numéro), puis **Actif**.

> Note : pour **initier** une conversation (notif de statut hors fenêtre 24h), Meta
> exige des **templates approuvés**. Le code envoie un message texte par défaut
> (fonctionne dans la fenêtre 24h) ; pour les notifications proactives, crée des
> templates dans Meta et on basculera l'envoi sur `sendWhatsAppTemplate`.

---

## Récap technique (pour mémoire)

- **Secrets** : table `integration_settings` — RLS activée **sans aucune policy**,
  donc seul `service_role` (serveur) y accède. Jamais exposée au client.
- **Flags publics on/off** : `app_settings.flexpay_enabled` / `whatsapp_enabled`
  (lisible anon, sans secret) — pilote l'affichage du checkout.
- **Webhooks** : Edge Functions Supabase `flexpay-callback` et `whatsapp-webhook`
  (déployées, `verify_jwt=false`).
- **Paiements** : colonnes `payments.provider / provider_status / phone / currency / raw`.
- **Code** : `src/lib/integrations/*.server.ts` (services), `src/lib/integrations.functions.ts`
  (server fns), `src/components/livroto/AdminIntegrationsPanel.tsx` (admin),
  `src/components/livroto/FlexPayDialog.tsx` (checkout).
