import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";
import { genererFacturePdf } from "@/lib/boutiques/facture-pdf.server";
import { getPrixEffectif } from "@/lib/boutiques/prix-promo";

// Encaissement caisse (POS). Point d'entrée UNIQUE pour créer une vente, que
// ce soit en ligne ou rejouée depuis la file d'attente offline (le
// hors_ligne_id assure l'idempotence : rejouer deux fois la même vente après
// une coupure réseau ne la double jamais).
export const boutiqueEncaisserVente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        hors_ligne_id: z.string().max(100).optional(),
        client_id: z.string().uuid().optional(),
        mode_paiement: z.enum(["cash", "mobile_money", "carte", "credit"]),
        // Requis uniquement en mode crédit : à qui appartient la dette et
        // quand elle doit être remboursée. Validé plus bas (Zod ne peut pas
        // exprimer "requis seulement si mode_paiement === credit" sans
        // .superRefine).
        date_echeance: z.string().max(10).optional(),
        // Motif libre de la dette (ex. "client régulier", "urgence
        // famille") — jamais obligatoire, purement informatif pour le staff
        // qui gère les relances plus tard.
        credit_notes: z.string().max(300).optional(),
        // Avance versée immédiatement à la caisse sur une vente à crédit (ex.
        // acompte) — optionnelle. Validée contre le total réel (calculé
        // serveur après résolution des prix/promo/remise) dans le handler,
        // pas ici : le sous-total n'est pas encore connu au moment du parse.
        avance_usd: z.number().min(0).max(100000).optional(),
        avance_mode_paiement: z.enum(["cash", "mobile_money", "carte"]).optional(),
        code_promo: z.string().max(40).optional(),
        lignes: z
          .array(
            z.object({
              produit_id: z.string().uuid(),
              quantite: z.number().int().positive().max(10000),
              // Remise manuelle : prix unitaire proposé par le staff à la
              // caisse. Optionnel — absent = prix catalogue/promo normal.
              // Jamais fait confiance au-delà de la vérification du plancher
              // plus bas : un prix soumis AU-DESSUS du prix catalogue/promo
              // est ignoré (jamais utilisé pour gonfler le prix), seule une
              // baisse volontaire compte.
              prix_unitaire_usd: z.number().min(0).max(100000).optional(),
            }),
          )
          .min(1)
          .max(200),
      })
      .superRefine((v, ctx) => {
        if (v.mode_paiement === "credit") {
          if (!v.client_id) {
            ctx.addIssue({ code: "custom", path: ["client_id"], message: "Un client est requis pour une vente à crédit." });
          }
          if (!v.date_echeance) {
            ctx.addIssue({ code: "custom", path: ["date_echeance"], message: "Une échéance est requise pour une vente à crédit." });
          }
        }
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur", "caissier"]);

    // Idempotence : une vente déjà enregistrée avec ce hors_ligne_id (accusé de
    // réception perdu en réseau instable, la caisse retente) est renvoyée
    // telle quelle — jamais recréée, jamais un second décrément de stock.
    if (data.hors_ligne_id) {
      const { data: existante } = await context.supabase
        .from("ventes")
        .select("id,numero,total_usd")
        .eq("boutique_id", data.boutique_id)
        .eq("hors_ligne_id", data.hors_ligne_id)
        .maybeSingle();
      if (existante) return { vente: existante, deja_traitee: true };
    }

    // Le prix vient TOUJOURS du catalogue au moment de l'encaissement, jamais
    // de ce que le client a soumis — un panier local peut dater d'avant un
    // changement de prix survenu pendant une coupure réseau.
    const produitIds = Array.from(new Set(data.lignes.map((l) => l.produit_id)));
    const { data: produits, error: prodErr } = await context.supabase
      .from("produits")
      .select("id,nom,prix_usd,prix_promo_usd,promo_actif,promo_debut,promo_fin,prix_achat_usd,prix_limite_vente_usd")
      .eq("boutique_id", data.boutique_id)
      .in("id", produitIds);
    if (prodErr) throw new Error(prodErr.message);
    const parId = new Map((produits ?? []).map((p) => [p.id, p]));

    let sousTotal = 0;
    const lignesCalc = data.lignes.map((l) => {
      const p = parId.get(l.produit_id);
      if (!p) throw new Error(`Produit introuvable dans cette boutique : ${l.produit_id}`);
      // Prix barré : le prix réellement facturé est le prix promo si la
      // promotion est en cours — jamais un affichage sans effet sur la caisse.
      const effectif = getPrixEffectif(p).prix;
      let prixUnitaire = effectif;
      let remiseLigne = 0;

      if (l.prix_unitaire_usd != null && l.prix_unitaire_usd < effectif) {
        // Résolution du plancher : plancher explicite d'abord, sinon coût
        // d'achat, sinon aucune remise possible pour ce produit.
        const plancher = p.prix_limite_vente_usd ?? p.prix_achat_usd ?? null;
        if (plancher == null) {
          throw new Error(
            `Aucune remise possible sur "${p.nom}" : aucun prix plancher ni prix d'achat n'est défini pour ce produit.`,
          );
        }
        if (l.prix_unitaire_usd < plancher) {
          throw new Error(
            `Prix refusé pour "${p.nom}" : ${l.prix_unitaire_usd} $ est sous le prix plancher (${plancher} $).`,
          );
        }
        prixUnitaire = l.prix_unitaire_usd;
        remiseLigne = Math.round((effectif - prixUnitaire) * 100) / 100;
      }

      const total_ligne_usd = Math.round(prixUnitaire * l.quantite * 100) / 100;
      sousTotal += total_ligne_usd;
      return {
        produit_id: l.produit_id,
        quantite: l.quantite,
        prix_unitaire_usd: prixUnitaire,
        remise_ligne_usd: remiseLigne,
        total_ligne_usd,
      };
    });
    sousTotal = Math.round(sousTotal * 100) / 100;

    let remise = 0;
    let codePromoId: string | null = null;
    if (data.code_promo) {
      const { data: validationRows, error: promoErr } = await context.supabase.rpc(
        "fn_valider_code_promo",
        {
          p_boutique_id: data.boutique_id,
          p_code: data.code_promo,
          p_montant_usd: sousTotal,
        },
      );
      if (promoErr) throw new Error(promoErr.message);
      const res = validationRows?.[0];
      if (!res?.valide) throw new Error(res?.motif ?? "Code promo invalide");
      remise = Number(res.remise_usd);
      codePromoId = res.code_promo_id;
    }

    const total = Math.round((sousTotal - remise) * 100) / 100;

    const { data: vente, error: venteErr } = await context.supabase
      .from("ventes")
      .insert({
        boutique_id: data.boutique_id,
        client_id: data.client_id ?? null,
        caissier_id: context.userId,
        mode_paiement: data.mode_paiement,
        sous_total_usd: sousTotal,
        code_promo_id: codePromoId,
        remise_usd: remise,
        total_usd: total,
        hors_ligne_id: data.hors_ligne_id ?? null,
      })
      .select("id,numero,total_usd")
      .single();
    if (venteErr) throw new Error(venteErr.message);

    // Déclenche automatiquement le décrément de stock (trigger sur
    // vente_lignes, cf. migration 33) — un seul chemin de code, partagé avec
    // l'e-commerce.
    const { error: lignesErr } = await context.supabase
      .from("vente_lignes")
      .insert(lignesCalc.map((l) => ({ ...l, vente_id: vente.id })));
    if (lignesErr) throw new Error(lignesErr.message);

    // Vente à crédit : le solde dû est traqué à part (table credits), toujours
    // lié à cette vente précise (donc à ses produits via vente_lignes) ET au
    // client — jamais l'un sans l'autre.
    if (data.mode_paiement === "credit") {
      // client_id/date_echeance sont garantis présents ici par le
      // .superRefine() du schéma Zod ci-dessus (requis si mode_paiement === "credit").
      if (data.avance_usd != null && data.avance_usd > 0 && data.avance_usd >= total) {
        throw new Error(
          "L'avance ne peut pas couvrir la totalité de la vente — utilise Cash ou Mobile Money si le client paie tout maintenant.",
        );
      }

      const { data: creditRow, error: creditErr } = await context.supabase
        .from("credits")
        .insert({
          boutique_id: data.boutique_id,
          vente_id: vente.id,
          client_id: data.client_id!,
          montant_total_usd: total,
          date_echeance: data.date_echeance!,
          notes: data.credit_notes || null,
        })
        .select("id")
        .single();
      if (creditErr) throw new Error(creditErr.message);

      // Avance versée immédiatement à la caisse (acompte) : même mécanisme
      // que les paiements ultérieurs (boutiqueEnregistrerPaiementCredit) —
      // une ligne credit_paiements, le trigger tg_credits_appliquer_paiement
      // (migration 50) recalcule automatiquement montant_paye_usd/statut.
      // Jamais un montant_paye_usd posé à la main sur `credits` : la vérité
      // vit dans les lignes, même philosophie que fn_mouvement_stock.
      if (data.avance_usd != null && data.avance_usd > 0) {
        const { error: avanceErr } = await context.supabase.from("credit_paiements").insert({
          credit_id: creditRow.id,
          boutique_id: data.boutique_id,
          montant_usd: data.avance_usd,
          mode_paiement: data.avance_mode_paiement ?? "cash",
          encaisse_par: context.userId,
          note: "Avance versée à la vente",
        });
        if (avanceErr) throw new Error(avanceErr.message);
      }
    }

    if (codePromoId) {
      // fn_incrementer_usage_code_promo est restreinte à service_role
      // (migration 40, pour empêcher un client d'épuiser le quota d'un code
      // en boucle) — on l'appelle donc via supabaseAdmin, jamais
      // context.supabase. L'autorisation métier a déjà été vérifiée plus
      // haut (assertBoutiqueStaff) : ce serverFn est un contexte de confiance.
      await supabaseAdmin.rpc("fn_incrementer_usage_code_promo", { p_code_promo_id: codePromoId });
    }

    // Facture auto-créée par le trigger DB (tg_ventes_generer_facture, migration
    // 33) dès l'insert de la vente — il ne reste qu'à en générer le PDF. Best
    // effort : un souci de rendu/stockage ne doit jamais faire échouer la vente
    // déjà encaissée (la caisse doit rester utilisable même si le stockage PDF
    // a un incident transitoire ; le PDF peut être régénéré plus tard).
    const { data: factureRow } = await context.supabase
      .from("factures")
      .select("id")
      .eq("vente_id", vente.id)
      .maybeSingle();
    if (factureRow) {
      genererFacturePdf(factureRow.id).catch((e) => {
        console.error("[boutiqueEncaisserVente] génération PDF facture échouée:", e);
      });
    }

    return { vente, deja_traitee: false };
  });

// Grille produits de la caisse (inspirée Odoo POS) : tous les produits actifs
// d'un coup, avec de quoi afficher une vraie vignette (image/catégorie/taille/
// couleur/stock) — le staff tape directement sur un article au lieu de taper
// une recherche à chaque vente. Catalogue d'une seule boutique : pas besoin de
// pagination, une limite haute suffit tant que ça reste une petite boutique.
export const boutiqueListerProduitsPos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur", "caissier"]);
    const { data: rows, error } = await context.supabase
      .from("produits")
      .select("id,nom,reference,prix_usd,prix_promo_usd,promo_actif,promo_debut,promo_fin,prix_achat_usd,prix_limite_vente_usd,quantite,image_url,categorie_id,boutique_categories(id,nom,icone),taille,couleur,images")
      .eq("boutique_id", data.boutique_id)
      .eq("actif", true)
      // Un produit en rupture n'a rien à vendre — ne pas l'afficher du tout
      // à la caisse (plutôt qu'une vignette grisée "Rupture" inutilisable),
      // même logique que la vitrine cliente.
      .gt("quantite", 0)
      .order("nom", { ascending: true })
      .limit(300);
    if (error) throw new Error(error.message);
    return { produits: rows ?? [] };
  });

// Recherche produit par qr_code_data (scan douchette/caméra) OU recherche
// manuelle par nom — une seule fonction, le POS n'a pas besoin de savoir
// comment le produit a été identifié.
export const boutiqueRechercherProduitPos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        qr_code_data: z.string().max(200).optional(),
        recherche: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur", "caissier"]);
    if (data.qr_code_data) {
      const { data: produit, error } = await context.supabase
        .from("produits")
        .select("id,nom,reference,prix_usd,prix_promo_usd,promo_actif,promo_debut,promo_fin,prix_achat_usd,prix_limite_vente_usd,quantite,image_url")
        .eq("boutique_id", data.boutique_id)
        .eq("qr_code_data", data.qr_code_data)
        .eq("actif", true)
        .gt("quantite", 0)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { produits: produit ? [produit] : [] };
    }
    const { data: rows, error } = await context.supabase
      .from("produits")
      .select("id,nom,reference,prix_usd,prix_promo_usd,promo_actif,promo_debut,promo_fin,prix_achat_usd,prix_limite_vente_usd,quantite,image_url")
      .eq("boutique_id", data.boutique_id)
      .eq("actif", true)
      .gt("quantite", 0)
      .ilike("nom", `%${data.recherche?.trim() ?? ""}%`)
      .limit(20);
    if (error) throw new Error(error.message);
    return { produits: rows ?? [] };
  });
