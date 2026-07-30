// Clients boutique côté staff — recherche/création rapide pour le sélecteur
// de client du POS (obligatoire pour une vente à crédit : le crédit doit
// toujours être lié à un client réel, jamais un texte libre). Réutilise
// clients_boutique, déjà utilisée par le flux e-commerce (client_id nullable,
// find-or-create par téléphone).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";

export const boutiqueListerClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        recherche: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    let q = context.supabase
      .from("clients_boutique")
      .select("id,nom,telephone,email")
      .eq("boutique_id", data.boutique_id);
    const recherche = data.recherche?.trim();
    if (recherche) q = q.or(`nom.ilike.%${recherche}%,telephone.ilike.%${recherche}%`);
    const { data: rows, error } = await q.order("nom", { ascending: true }).limit(30);
    if (error) throw new Error(error.message);
    return { clients: rows ?? [] };
  });

// Trouve un client par téléphone (dédoublonnage) ou en crée un — même
// principe que le checkout e-commerce (ecommerce.functions.ts), mais côté
// staff : le vendeur saisit le client directement au comptoir.
export const boutiqueTrouverOuCreerClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        nom: z.string().min(1).max(120),
        telephone: z.string().min(3).max(30),
        email: z.string().email().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur", "caissier"]);
    const nom = data.nom.trim();
    const telephone = data.telephone.trim();

    const { data: existant } = await context.supabase
      .from("clients_boutique")
      .select("id,nom,telephone,email")
      .eq("boutique_id", data.boutique_id)
      .eq("telephone", telephone)
      .maybeSingle();
    if (existant) return { client: existant };

    const { data: row, error } = await context.supabase
      .from("clients_boutique")
      .insert({ boutique_id: data.boutique_id, nom, telephone, email: data.email ?? null })
      .select("id,nom,telephone,email")
      .single();
    if (error) throw new Error(error.message);
    return { client: row };
  });
