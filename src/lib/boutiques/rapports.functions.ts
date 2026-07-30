import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";

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

    const arrondir = (n: number) => Math.round(n * 100) / 100;

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
