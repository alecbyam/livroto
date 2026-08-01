import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";

const arrondir = (n: number) => Math.round(n * 100) / 100;

// Rapports agrégés en JS à partir de ventes/vente_lignes plutôt qu'une
// fonction SQL dédiée : volumes attendus pour une boutique (pas le
// marketplace multi-vendeurs) restent modestes, et ça évite une migration
// supplémentaire pour un premier jet de rapports. À revoir en fonction SQL
// (cf. admin_daily_order_stats côté marketplace) si le volume grossit.
export const boutiqueObtenirRapports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        depuis: z.string().datetime(),
        jusqua: z.string().datetime(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);

    const [
      { data: ventes, error: ventesErr },
      { data: lignes, error: lignesErr },
      { data: codesPromo, error: promoErr },
    ] = await Promise.all([
      context.supabase
        .from("ventes")
        .select("id,canal,mode_paiement,total_usd,remise_usd,statut,created_at")
        .eq("boutique_id", data.boutique_id)
        .eq("statut", "validee")
        .gte("created_at", data.depuis)
        .lte("created_at", data.jusqua),
      context.supabase
        .from("vente_lignes")
        .select(
          "produit_id,quantite,total_ligne_usd,ventes!inner(boutique_id,statut,created_at),produits(nom)",
        )
        .eq("ventes.boutique_id", data.boutique_id)
        .eq("ventes.statut", "validee")
        .gte("ventes.created_at", data.depuis)
        .lte("ventes.created_at", data.jusqua),
      context.supabase
        .from("codes_promo")
        .select("code,usage_actuel,usage_max,actif")
        .eq("boutique_id", data.boutique_id),
    ]);
    if (ventesErr) throw new Error(ventesErr.message);
    if (lignesErr) throw new Error(lignesErr.message);
    if (promoErr) throw new Error(promoErr.message);

    const caTotal = (ventes ?? []).reduce((s, v) => s + Number(v.total_usd), 0);
    const caPos = (ventes ?? [])
      .filter((v) => v.canal === "pos")
      .reduce((s, v) => s + Number(v.total_usd), 0);
    const caEcommerce = (ventes ?? [])
      .filter((v) => v.canal === "ecommerce")
      .reduce((s, v) => s + Number(v.total_usd), 0);
    const remiseTotal = (ventes ?? []).reduce((s, v) => s + Number(v.remise_usd), 0);
    const nbVentesAvecPromo = (ventes ?? []).filter((v) => Number(v.remise_usd) > 0).length;

    const parProduit = new Map<string, { nom: string; quantite: number; revenu: number }>();
    for (const l of lignes ?? []) {
      const nom = (l as any).produits?.nom ?? "Produit supprimé";
      const cur = parProduit.get(l.produit_id) ?? { nom, quantite: 0, revenu: 0 };
      cur.quantite += l.quantite;
      cur.revenu += Number(l.total_ligne_usd);
      parProduit.set(l.produit_id, cur);
    }
    const produitsClasses = Array.from(parProduit.values()).sort((a, b) => b.quantite - a.quantite);

    // Répartition par mode de paiement — utile pour la clôture de caisse
    // journalière (combien de cash à compter physiquement vs mobile money).
    const parModePaiement = new Map<string, { nb: number; total: number }>();
    for (const v of ventes ?? []) {
      const cur = parModePaiement.get(v.mode_paiement) ?? { nb: 0, total: 0 };
      cur.nb += 1;
      cur.total += Number(v.total_usd);
      parModePaiement.set(v.mode_paiement, cur);
    }

    return {
      periode: { depuis: data.depuis, jusqua: data.jusqua },
      ca: { total: caTotal, pos: caPos, ecommerce: caEcommerce, remises: remiseTotal },
      nb_ventes: (ventes ?? []).length,
      panier_moyen: (ventes ?? []).length > 0 ? caTotal / (ventes ?? []).length : 0,
      top_produits: produitsClasses.slice(0, 10),
      produits_moins_vendus: produitsClasses.slice(-10).reverse(),
      codes_promo: (codesPromo ?? []).map((c) => ({ ...c, ventes_avec_promo: nbVentesAvecPromo })),
      par_mode_paiement: Array.from(parModePaiement.entries()).map(([mode, v]) => ({
        mode,
        nb: v.nb,
        total: v.total,
      })),
    };
  });

// Inventaire par catégorie/sous-catégorie + valeur du stock — valorisé au
// prix d'achat quand il est connu (marge réelle immobilisée), sinon au prix
// de vente à défaut (produits créés avant l'ajout du prix d'achat).
export const boutiqueObtenirRapportStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    const { data: produits, error } = await context.supabase
      .from("produits")
      .select(
        "id,nom,quantite,prix_usd,prix_achat_usd,stock_bas,categorie_id,sous_categorie_id,boutique_categories(nom,icone),sous_categories(nom)",
      )
      .eq("boutique_id", data.boutique_id)
      .eq("actif", true);
    if (error) throw new Error(error.message);

    const rows = produits ?? [];
    const valeurUnitaire = (p: (typeof rows)[number]) =>
      p.prix_achat_usd != null ? Number(p.prix_achat_usd) : Number(p.prix_usd);

    type Cumul = { nom: string; icone: string | null; nb_produits: number; quantite: number; valeur_usd: number };
    const parCategorie = new Map<string, Cumul>();
    const parSousCategorie = new Map<
      string,
      Cumul & { categorie_id: string }
    >();

    for (const p of rows) {
      const catId = p.categorie_id ?? "sans_categorie";
      const catNom = (p as any).boutique_categories?.nom ?? "Sans catégorie";
      const catIcone = (p as any).boutique_categories?.icone ?? null;
      const cCat = parCategorie.get(catId) ?? { nom: catNom, icone: catIcone, nb_produits: 0, quantite: 0, valeur_usd: 0 };
      cCat.nb_produits += 1;
      cCat.quantite += p.quantite;
      cCat.valeur_usd += p.quantite * valeurUnitaire(p);
      parCategorie.set(catId, cCat);

      if (p.sous_categorie_id) {
        const sousNom = (p as any).sous_categories?.nom ?? "Sous-catégorie";
        const cSous = parSousCategorie.get(p.sous_categorie_id) ?? {
          nom: sousNom,
          icone: null,
          nb_produits: 0,
          quantite: 0,
          valeur_usd: 0,
          categorie_id: catId,
        };
        cSous.nb_produits += 1;
        cSous.quantite += p.quantite;
        cSous.valeur_usd += p.quantite * valeurUnitaire(p);
        parSousCategorie.set(p.sous_categorie_id, cSous);
      }
    }

    return {
      valeur_stock_totale_usd: arrondir(rows.reduce((s, p) => s + p.quantite * valeurUnitaire(p), 0)),
      quantite_totale: rows.reduce((s, p) => s + p.quantite, 0),
      nb_produits: rows.length,
      nb_stock_bas: rows.filter((p) => p.stock_bas).length,
      produits_stock_bas: rows
        .filter((p) => p.stock_bas)
        .map((p) => ({ id: p.id, nom: p.nom, quantite: p.quantite })),
      par_categorie: Array.from(parCategorie.entries()).map(([id, c]) => ({
        id,
        nom: c.nom,
        icone: c.icone,
        nb_produits: c.nb_produits,
        quantite: c.quantite,
        valeur_usd: arrondir(c.valeur_usd),
      })),
      par_sous_categorie: Array.from(parSousCategorie.entries()).map(([id, c]) => ({
        id,
        categorie_id: c.categorie_id,
        nom: c.nom,
        nb_produits: c.nb_produits,
        quantite: c.quantite,
        valeur_usd: arrondir(c.valeur_usd),
      })),
    };
  });

// Nombre de jours (inclusif) où une charge chevauche la période demandée —
// utilisé pour le prorata jour/jour des charges récurrentes mensuelles.
function joursActifsDansPeriode(
  dateCharge: string,
  dateFin: string | null,
  periodeDebut: Date,
  periodeFin: Date,
): number {
  const debutCharge = new Date(dateCharge);
  const finCharge = dateFin ? new Date(dateFin) : null;
  const debutIntersect = debutCharge > periodeDebut ? debutCharge : periodeDebut;
  const finIntersect = finCharge && finCharge < periodeFin ? finCharge : periodeFin;
  const jours = Math.floor((finIntersect.getTime() - debutIntersect.getTime()) / 86_400_000) + 1;
  return Math.max(0, jours);
}

// Rentabilité réelle = chiffre d'affaires - coût des marchandises vendues -
// charges d'exploitation (loyer/personnel/autre) de la période. Réservé aux
// admins (contrairement aux autres rapports, ouverts à tout le staff) : le
// détail par type de charge expose indirectement des données sensibles
// (masse salariale, loyer). Le coût des marchandises utilise le
// prix_achat_usd ACTUEL des produits (pas un instantané pris au moment de la
// vente) — même compromis délibéré que la valorisation du stock ci-dessus ;
// nb_lignes_cout_inconnu signale les lignes vendues sans prix d'achat connu.
export const boutiqueObtenirRapportRentabilite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        depuis: z.string().datetime(),
        jusqua: z.string().datetime(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);

    const [
      { data: ventes, error: ventesErr },
      { data: lignes, error: lignesErr },
      { data: charges, error: chargesErr },
    ] = await Promise.all([
      context.supabase
        .from("ventes")
        .select("total_usd")
        .eq("boutique_id", data.boutique_id)
        .eq("statut", "validee")
        .gte("created_at", data.depuis)
        .lte("created_at", data.jusqua),
      context.supabase
        .from("vente_lignes")
        .select("quantite,remise_ligne_usd,produits(prix_achat_usd),ventes!inner(boutique_id,statut,created_at)")
        .eq("ventes.boutique_id", data.boutique_id)
        .eq("ventes.statut", "validee")
        .gte("ventes.created_at", data.depuis)
        .lte("ventes.created_at", data.jusqua),
      // PAS de filtre actif=true ici : une charge désactivée doit rester
      // comptée pour les périodes passées où elle était en vigueur (cf.
      // date_fin, migration 57) — contrairement à boutiqueListerCharges qui,
      // lui, ne montre que les charges "en cours" par défaut.
      context.supabase
        .from("boutique_charges")
        .select("id,type,libelle,montant_usd,recurrence,date_charge,date_fin")
        .eq("boutique_id", data.boutique_id),
    ]);
    if (ventesErr) throw new Error(ventesErr.message);
    if (lignesErr) throw new Error(lignesErr.message);
    if (chargesErr) throw new Error(chargesErr.message);

    const revenuUsd = (ventes ?? []).reduce((s, v) => s + Number(v.total_usd), 0);

    let cogsUsd = 0;
    let remiseManuelleTotale = 0;
    let nbLignesCoutInconnu = 0;
    for (const l of lignes ?? []) {
      const coutUnitaire = (l as any).produits?.prix_achat_usd;
      if (coutUnitaire == null) nbLignesCoutInconnu++;
      cogsUsd += l.quantite * Number(coutUnitaire ?? 0);
      remiseManuelleTotale += l.quantite * Number(l.remise_ligne_usd ?? 0);
    }

    const periodeDebut = new Date(data.depuis);
    const periodeFin = new Date(data.jusqua);
    const chargesDetail = (charges ?? []).map((c) => {
      let montantPeriode = 0;
      if (c.recurrence === "ponctuelle") {
        const d = new Date(c.date_charge);
        montantPeriode = d >= periodeDebut && d <= periodeFin ? Number(c.montant_usd) : 0;
      } else {
        // Prorata jour/jour : montant_mensuel / 30 * jours actifs dans la
        // période (convention fixe délibérée, pas le nombre réel de jours du
        // mois calendaire — évite qu'une même charge fixe varie de mois en
        // mois selon qu'il fait 28, 30 ou 31 jours).
        const jours = joursActifsDansPeriode(c.date_charge, c.date_fin, periodeDebut, periodeFin);
        montantPeriode = (Number(c.montant_usd) / 30) * jours;
      }
      return { ...c, montant_periode_usd: arrondir(montantPeriode) };
    });
    const chargesTotalUsd = arrondir(chargesDetail.reduce((s, c) => s + c.montant_periode_usd, 0));

    const parType = new Map<string, number>();
    for (const c of chargesDetail) parType.set(c.type, (parType.get(c.type) ?? 0) + c.montant_periode_usd);

    const margeBrute = arrondir(revenuUsd - cogsUsd);
    const margeNette = arrondir(margeBrute - chargesTotalUsd);

    return {
      periode: { depuis: data.depuis, jusqua: data.jusqua },
      revenu_usd: arrondir(revenuUsd),
      cout_marchandises_usd: arrondir(cogsUsd),
      marge_brute_usd: margeBrute,
      remises_manuelles_usd: arrondir(remiseManuelleTotale),
      nb_lignes_cout_inconnu: nbLignesCoutInconnu,
      charges: {
        total_usd: chargesTotalUsd,
        par_type: Array.from(parType.entries()).map(([type, total]) => ({ type, total_usd: arrondir(total) })),
        detail: chargesDetail.map((c) => ({
          id: c.id,
          type: c.type,
          libelle: c.libelle,
          recurrence: c.recurrence,
          montant_usd: Number(c.montant_usd),
          montant_periode_usd: c.montant_periode_usd,
        })),
      },
      marge_nette_usd: margeNette,
      marge_nette_pourcentage: revenuUsd > 0 ? Math.round((margeNette / revenuUsd) * 100) : 0,
    };
  });

// Export CSV : renvoie le texte CSV directement, le téléchargement est géré
// côté client (Blob) — pas besoin d'un endpoint de fichier statique séparé.
export const boutiqueExporterVentesCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        depuis: z.string().datetime(),
        jusqua: z.string().datetime(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    const { data: ventes, error } = await context.supabase
      .from("ventes")
      .select("numero,canal,mode_paiement,sous_total_usd,remise_usd,total_usd,statut,created_at")
      .eq("boutique_id", data.boutique_id)
      .gte("created_at", data.depuis)
      .lte("created_at", data.jusqua)
      .order("created_at");
    if (error) throw new Error(error.message);

    const entetes = [
      "numero",
      "canal",
      "mode_paiement",
      "sous_total_usd",
      "remise_usd",
      "total_usd",
      "statut",
      "created_at",
    ];
    const lignesCsv = (ventes ?? []).map((v: any) =>
      entetes.map((c) => String(v[c] ?? "")).join(","),
    );
    const csv = [entetes.join(","), ...lignesCsv].join("\n");
    return { csv };
  });
