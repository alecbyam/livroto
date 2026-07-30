// Catégories dynamiques (migration 49) — remplace l'ancien enum fixe
// 'vetement'/'accessoire'. Chaque boutique gère ses propres catégories,
// chacune avec ses sous-catégories (voir sous-categories.functions.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";

export const boutiqueListerCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        inclure_inactives: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    let q = context.supabase
      .from("boutique_categories")
      .select("id,nom,icone,actif")
      .eq("boutique_id", data.boutique_id);
    if (!data.inclure_inactives) q = q.eq("actif", true);
    const { data: rows, error } = await q.order("nom", { ascending: true });
    if (error) throw new Error(error.message);
    return { categories: rows ?? [] };
  });

export const boutiqueCreerCategorie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        nom: z.string().min(1).max(60),
        icone: z.string().max(8).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);
    const nom = data.nom.trim();

    const { data: existante } = await context.supabase
      .from("boutique_categories")
      .select("id,nom,icone,actif")
      .eq("boutique_id", data.boutique_id)
      .ilike("nom", nom)
      .maybeSingle();
    if (existante) {
      // Une catégorie désactivée du même nom est réactivée plutôt que de créer
      // un doublon — l'utilisateur qui la recrée veut manifestement la
      // remettre en service.
      if (!existante.actif) {
        const { data: reactivee, error: reactErr } = await context.supabase
          .from("boutique_categories")
          .update({ actif: true, icone: data.icone ?? existante.icone })
          .eq("id", existante.id)
          .select("id,nom,icone,actif")
          .single();
        if (reactErr) throw new Error(reactErr.message);
        return { categorie: reactivee };
      }
      return { categorie: existante };
    }

    const { data: row, error } = await context.supabase
      .from("boutique_categories")
      .insert({ boutique_id: data.boutique_id, nom, icone: data.icone ?? null })
      .select("id,nom,icone,actif")
      .single();
    if (error) throw new Error(error.message);
    return { categorie: row };
  });

export const boutiqueModifierCategorie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        categorie_id: z.string().uuid(),
        nom: z.string().min(1).max(60).optional(),
        icone: z.string().max(8).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);
    const { boutique_id, categorie_id, ...patch } = data;
    if (patch.nom) patch.nom = patch.nom.trim();
    const { error } = await context.supabase
      .from("boutique_categories")
      .update(patch)
      .eq("id", categorie_id)
      .eq("boutique_id", boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Désactivation, pas suppression : des produits et sous-catégories existants
// référencent categorie_id (FK sans cascade) — une vraie DELETE échouerait de
// toute façon tant qu'ils existent, et on préfère garder l'historique/les
// rapports intacts, même logique que boutiqueSupprimerSousCategorie.
export const boutiqueSupprimerCategorie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ boutique_id: z.string().uuid(), categorie_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const { error } = await context.supabase
      .from("boutique_categories")
      .update({ actif: false })
      .eq("id", data.categorie_id)
      .eq("boutique_id", data.boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
