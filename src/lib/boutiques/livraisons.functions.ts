import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";

// Pas de transporteur externe : la livraison est assurée SOIT par JuntoX via
// le réseau de livreurs Livroto existant (table `riders`, rider_id renseigné),
// SOIT par la boutique cliente elle-même (son propre moyen, coursier_nom en
// texte libre). Aucune API tierce — saisie/assignation manuelle par le staff.
export const boutiqueObtenirOuCreerLivraison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid(), commande_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur", "caissier"]);
    const { data: existante } = await context.supabase
      .from("livraisons")
      .select("*")
      .eq("commande_id", data.commande_id)
      .eq("boutique_id", data.boutique_id)
      .maybeSingle();
    if (existante) return { livraison: existante };

    const { data: creee, error } = await context.supabase
      .from("livraisons")
      .insert({ boutique_id: data.boutique_id, commande_id: data.commande_id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { livraison: creee };
  });

// Liste des livreurs Livroto actifs — pour l'assignation quand
// mode_livraison='juntox_livroto'. Lecture simple de la table `riders`
// existante (marketplace) ; aucune duplication de données, juste une lecture
// croisée depuis le module boutique.
export const boutiqueListerLivreursDisponibles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur", "caissier"]);
    const { data: rows, error } = await context.supabase
      .from("riders")
      .select("id,full_name")
      .eq("status", "active")
      .order("full_name");
    if (error) throw new Error(error.message);
    return { livreurs: rows ?? [] };
  });

export const boutiqueMettreAJourLivraison = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    boutique_id: z.string().uuid(),
    livraison_id: z.string().uuid(),
    mode_livraison: z.enum(["juntox_livroto", "boutique"]).optional(),
    statut_livraison: z.enum(["en_attente", "prise_en_charge", "en_transit", "livree", "echec", "retournee"]),
    rider_id: z.string().uuid().nullable().optional(),
    coursier_nom: z.string().max(120).optional(),
    tracking_url: z.string().url().max(500).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur", "caissier"]);
    const patch: Record<string, unknown> = { statut_livraison: data.statut_livraison };
    if (data.mode_livraison !== undefined) patch.mode_livraison = data.mode_livraison;
    if (data.rider_id !== undefined) patch.rider_id = data.rider_id;
    if (data.coursier_nom !== undefined) patch.coursier_nom = data.coursier_nom;
    if (data.tracking_url !== undefined) patch.tracking_url = data.tracking_url;
    if (data.statut_livraison === "prise_en_charge") patch.date_prise_en_charge = new Date().toISOString();
    if (data.statut_livraison === "livree") patch.date_livraison = new Date().toISOString();

    const { error } = await context.supabase
      .from("livraisons")
      .update(patch as never)
      .eq("id", data.livraison_id)
      .eq("boutique_id", data.boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
