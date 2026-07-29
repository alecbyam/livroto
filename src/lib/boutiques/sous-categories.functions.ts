// Sous-catégories par catégorie (ex: "Chemises", "Robes" sous vêtements ;
// "Sacs", "Ceintures" sous accessoires) — migration 48. Réutilisables d'un
// produit à l'autre (évite les doublons/incohérences d'une saisie libre —
// "Chemise" vs "chemises" vs "Chemise Homme").
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";

export const boutiqueListerSousCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        categorie: z.enum(["vetement", "accessoire"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    let q = context.supabase
      .from("sous_categories")
      .select("id,categorie,nom")
      .eq("boutique_id", data.boutique_id)
      .eq("actif", true);
    if (data.categorie) q = q.eq("categorie", data.categorie);
    const { data: rows, error } = await q.order("nom", { ascending: true });
    if (error) throw new Error(error.message);
    return { sousCategories: rows ?? [] };
  });

// Crée la sous-catégorie si elle n'existe pas encore (nom identique dans la
// même catégorie) — sinon renvoie celle qui existe déjà. Le formulaire de
// création produit propose ainsi de "créer à la volée" sans jamais dupliquer.
export const boutiqueCreerSousCategorie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        categorie: z.enum(["vetement", "accessoire"]),
        nom: z.string().min(1).max(60),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);
    const nom = data.nom.trim();

    const { data: existante } = await context.supabase
      .from("sous_categories")
      .select("id,categorie,nom")
      .eq("boutique_id", data.boutique_id)
      .eq("categorie", data.categorie)
      .ilike("nom", nom)
      .maybeSingle();
    if (existante) return { sousCategorie: existante };

    const { data: row, error } = await context.supabase
      .from("sous_categories")
      .insert({ boutique_id: data.boutique_id, categorie: data.categorie, nom })
      .select("id,categorie,nom")
      .single();
    if (error) throw new Error(error.message);
    return { sousCategorie: row };
  });

export const boutiqueSupprimerSousCategorie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ boutique_id: z.string().uuid(), sous_categorie_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    // Désactivation, pas suppression : des produits existants peuvent encore
    // y faire référence (sous_categorie_id passe alors à NULL via la FK
    // seulement si la ligne est réellement supprimée — ici on préfère garder
    // la ligne pour ne pas casser l'historique/les rapports).
    const { error } = await context.supabase
      .from("sous_categories")
      .update({ actif: false })
      .eq("id", data.sous_categorie_id)
      .eq("boutique_id", data.boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
