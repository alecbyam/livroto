import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";
import {
  notifierConfirmationCommande,
  notifierChangementStatut,
} from "@/lib/boutiques/whatsapp.server";
import { getPrixEffectif } from "@/lib/boutiques/prix-promo";

// ============================================================================
// Checkout invité : PAS de middleware requireSupabaseAuth — un visiteur sans
// compte doit pouvoir commander ("paiement à la livraison sans compte", cahier
// des charges). On utilise service_role de bout en bout : ça évite aussi le
// piège RLS découvert en phase 3 (INSERT...RETURNING déclenche les policies
// SELECT, qu'un visiteur anonyme ne satisfait jamais sur commandes_ecommerce).
// Les prix sont TOUJOURS recalculés ici depuis le catalogue, jamais acceptés
// tels quels du panier client (même principe que checkout.functions.ts pour
// le marketplace).
// ============================================================================
export const boutiqueCreerCommande = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        client_nom: z.string().min(2).max(120),
        client_telephone: z.string().min(6).max(30),
        client_email: z.string().email().optional(),
        adresse_livraison: z.string().min(5).max(500),
        mode_paiement: z.enum(["mobile_money", "paiement_livraison"]),
        code_promo: z.string().max(40).optional(),
        lignes: z
          .array(
            z.object({
              produit_id: z.string().uuid(),
              quantite: z.number().int().positive().max(1000),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const admin = supabaseAdmin;

    const { data: boutique } = await admin
      .from("boutiques")
      .select("id")
      .eq("id", data.boutique_id)
      .eq("actif", true)
      .maybeSingle();
    if (!boutique) throw new Error("Boutique introuvable ou inactive.");

    // Client invité : retrouvé par téléphone (pas de compte), sinon créé.
    let clientId: string;
    const { data: clientExistant } = await admin
      .from("clients_boutique")
      .select("id")
      .eq("boutique_id", data.boutique_id)
      .eq("telephone", data.client_telephone)
      .is("user_id", null)
      .maybeSingle();
    if (clientExistant) {
      clientId = clientExistant.id;
      await admin
        .from("clients_boutique")
        .update({
          nom: data.client_nom,
          email: data.client_email ?? null,
          adresse_defaut: data.adresse_livraison,
        })
        .eq("id", clientId);
    } else {
      const { data: nouveauClient, error: clientErr } = await admin
        .from("clients_boutique")
        .insert({
          boutique_id: data.boutique_id,
          nom: data.client_nom,
          telephone: data.client_telephone,
          email: data.client_email ?? null,
          adresse_defaut: data.adresse_livraison,
        })
        .select("id")
        .single();
      if (clientErr) throw new Error(clientErr.message);
      clientId = nouveauClient.id;
    }

    const produitIds = Array.from(new Set(data.lignes.map((l) => l.produit_id)));
    const { data: produits, error: prodErr } = await admin
      .from("produits")
      .select("id,nom,prix_usd,prix_promo_usd,promo_actif,promo_debut,promo_fin,actif,quantite")
      .eq("boutique_id", data.boutique_id)
      .in("id", produitIds);
    if (prodErr) throw new Error(prodErr.message);
    const parId = new Map((produits ?? []).map((p) => [p.id, p]));

    // Le stock n'est décrémenté qu'à la CONFIRMATION (trigger DB, migration 36
    // — un vendeur peut vouloir vérifier/ajuster avant d'engager le stock), pas
    // ici. Mais accepter une commande déjà mathématiquement impossible (plus
    // demandé que ce qui existe) ne fait que reporter une exception Postgres
    // opaque au moment de la confirmation — ce contrôle basique donne
    // immédiatement une erreur claire au client au lieu de ça. La vraie race
    // (deux invités commandant la dernière pièce en même temps) reste possible
    // et volontairement acceptée, comme documenté dans la migration.
    let sousTotal = 0;
    const lignesCalc = data.lignes.map((l) => {
      const p = parId.get(l.produit_id);
      if (!p || !p.actif) throw new Error(`Produit indisponible : ${l.produit_id}`);
      if (p.quantite < l.quantite) {
        throw new Error(`Stock insuffisant pour "${p.nom}" (${p.quantite} disponible(s)).`);
      }
      // Prix barré : le prix réellement facturé est le prix promo si la
      // promotion est en cours — jamais un affichage sans effet sur la commande.
      const prixUnitaire = getPrixEffectif(p).prix;
      const total_ligne_usd = Math.round(prixUnitaire * l.quantite * 100) / 100;
      sousTotal += total_ligne_usd;
      return {
        produit_id: l.produit_id,
        quantite: l.quantite,
        prix_unitaire_usd: prixUnitaire,
        total_ligne_usd,
      };
    });
    sousTotal = Math.round(sousTotal * 100) / 100;

    let remise = 0;
    let codePromoId: string | null = null;
    if (data.code_promo) {
      const { data: validationRows, error } = await admin.rpc("fn_valider_code_promo", {
        p_boutique_id: data.boutique_id,
        p_code: data.code_promo,
        p_montant_usd: sousTotal,
      });
      if (error) throw new Error(error.message);
      const res = validationRows?.[0];
      if (!res?.valide) throw new Error(res?.motif ?? "Code promo invalide");
      remise = Number(res.remise_usd);
      codePromoId = res.code_promo_id;
    }

    // Pas encore de calcul de frais par zone pour les boutiques (dépend de
    // l'intégration HM Logistics, phase suivante) — 0 pour l'instant.
    const fraisLivraison = 0;
    const total = Math.round((sousTotal - remise + fraisLivraison) * 100) / 100;

    const { data: commande, error: cmdErr } = await admin
      .from("commandes_ecommerce")
      .insert({
        boutique_id: data.boutique_id,
        client_id: clientId,
        adresse_livraison: data.adresse_livraison,
        mode_paiement: data.mode_paiement,
        code_promo_id: codePromoId,
        sous_total_usd: sousTotal,
        remise_usd: remise,
        frais_livraison_usd: fraisLivraison,
        total_usd: total,
      })
      .select("id,numero,total_usd")
      .single();
    if (cmdErr) throw new Error(cmdErr.message);

    const { error: lignesErr } = await admin
      .from("commande_lignes")
      .insert(lignesCalc.map((l) => ({ ...l, commande_id: commande.id })));
    if (lignesErr) throw new Error(lignesErr.message);

    // Confirmation WhatsApp best-effort — ne bloque jamais la commande déjà
    // enregistrée si l'envoi échoue (cf. commentaire dans whatsapp.server.ts).
    const { data: boutiqueInfo } = await admin
      .from("boutiques")
      .select("nom")
      .eq("id", data.boutique_id)
      .single();
    notifierConfirmationCommande({
      boutiqueId: data.boutique_id,
      boutiqueNom: boutiqueInfo?.nom ?? "",
      telephone: data.client_telephone,
      numero: commande.numero ?? "",
      totalUsd: commande.total_usd,
    }).catch(() => {});

    return { commande };
  });

// Suivi invité : numéro de commande + téléphone (pas de compte nécessaire),
// jamais une policy RLS ouverte à anon (empêcherait l'énumération des
// commandes d'une boutique).
export const boutiqueSuivreCommande = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        numero: z.string().min(3).max(20),
        telephone: z.string().min(6).max(30),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: commande, error } = await supabaseAdmin
      .from("commandes_ecommerce")
      .select(
        "numero,statut,total_usd,adresse_livraison,created_at," +
          "clients_boutique!inner(telephone)," +
          "lignes:commande_lignes(quantite,prix_unitaire_usd,total_ligne_usd,produits(nom))," +
          "livraisons(statut_hm_logistics,tracking_url,date_livraison)",
      )
      .eq("boutique_id", data.boutique_id)
      .eq("numero", data.numero)
      .eq("clients_boutique.telephone", data.telephone)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!commande) throw new Error("Commande introuvable pour ce numéro et ce téléphone.");
    return { commande };
  });

// ---------- Admin : gestion des commandes entrantes ----------
export const boutiqueListerCommandesEcommerce = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        offset: z.number().int().min(0).default(0),
        statut: z.enum(["en_attente", "confirmee", "expediee", "livree", "annulee"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    let q = context.supabase
      .from("commandes_ecommerce")
      .select(
        "*,clients_boutique(nom,telephone),lignes:commande_lignes(quantite,prix_unitaire_usd,total_ligne_usd,produits(nom))",
        { count: "exact" },
      )
      .eq("boutique_id", data.boutique_id);
    if (data.statut) q = q.eq("statut", data.statut);
    const {
      data: rows,
      error,
      count,
    } = await q.order("created_at", { ascending: false }).range(data.offset, data.offset + 29);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const boutiqueChangerStatutCommande = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        commande_id: z.string().uuid(),
        statut: z.enum(["en_attente", "confirmee", "expediee", "livree", "annulee"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur", "caissier"]);
    // Le décrément/restauration de stock est géré par le trigger DB
    // (tg_commandes_ecommerce_stock, migration 36) — ce serverFn ne fait que
    // changer le statut, jamais toucher le stock lui-même.
    const { data: commande, error } = await context.supabase
      .from("commandes_ecommerce")
      .update({ statut: data.statut })
      .eq("id", data.commande_id)
      .eq("boutique_id", data.boutique_id)
      .select("numero,client_id,clients_boutique(telephone)")
      .single();
    if (error) throw new Error(error.message);

    const telephone = (commande as any)?.clients_boutique?.telephone;
    if (telephone) {
      const { data: boutiqueInfo } = await context.supabase
        .from("boutiques")
        .select("nom")
        .eq("id", data.boutique_id)
        .single();
      notifierChangementStatut({
        boutiqueId: data.boutique_id,
        boutiqueNom: boutiqueInfo?.nom ?? "",
        telephone,
        numero: commande?.numero ?? "",
        statut: data.statut,
      }).catch(() => {});
    }

    return { ok: true };
  });
