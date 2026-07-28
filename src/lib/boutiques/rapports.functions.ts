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
  .inputValidator((input) => z.object({
    boutique_id: z.string().uuid(),
    depuis: z.string().datetime(),
    jusqua: z.string().datetime(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);

    const [{ data: ventes, error: ventesErr }, { data: lignes, error: lignesErr }, { data: codesPromo, error: promoErr }] = await Promise.all([
      context.supabase
        .from("ventes")
        .select("id,canal,total_usd,remise_usd,statut,created_at")
        .eq("boutique_id", data.boutique_id)
        .eq("statut", "validee")
        .gte("created_at", data.depuis)
        .lte("created_at", data.jusqua),
      context.supabase
        .from("vente_lignes")
        .select("produit_id,quantite,total_ligne_usd,ventes!inner(boutique_id,statut,created_at),produits(nom)")
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
    const caPos = (ventes ?? []).filter((v) => v.canal === "pos").reduce((s, v) => s + Number(v.total_usd), 0);
    const caEcommerce = (ventes ?? []).filter((v) => v.canal === "ecommerce").reduce((s, v) => s + Number(v.total_usd), 0);
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

    return {
      periode: { depuis: data.depuis, jusqua: data.jusqua },
      ca: { total: caTotal, pos: caPos, ecommerce: caEcommerce, remises: remiseTotal },
      nb_ventes: (ventes ?? []).length,
      panier_moyen: (ventes ?? []).length > 0 ? caTotal / (ventes ?? []).length : 0,
      top_produits: produitsClasses.slice(0, 10),
      produits_moins_vendus: produitsClasses.slice(-10).reverse(),
      codes_promo: (codesPromo ?? []).map((c) => ({ ...c, ventes_avec_promo: nbVentesAvecPromo })),
    };
  });

// Export CSV : renvoie le texte CSV directement, le téléchargement est géré
// côté client (Blob) — pas besoin d'un endpoint de fichier statique séparé.
export const boutiqueExporterVentesCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    boutique_id: z.string().uuid(),
    depuis: z.string().datetime(),
    jusqua: z.string().datetime(),
  }).parse(input))
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

    const entetes = ["numero", "canal", "mode_paiement", "sous_total_usd", "remise_usd", "total_usd", "statut", "created_at"];
    const lignesCsv = (ventes ?? []).map((v: any) =>
      entetes.map((c) => String(v[c] ?? "")).join(","),
    );
    const csv = [entetes.join(","), ...lignesCsv].join("\n");
    return { csv };
  });
