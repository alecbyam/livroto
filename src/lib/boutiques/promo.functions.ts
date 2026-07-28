import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";

export const boutiqueListerCodesPromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    const { data: rows, error } = await context.supabase
      .from("codes_promo")
      .select("*")
      .eq("boutique_id", data.boutique_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const boutiqueUpsertCodePromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      boutique_id: z.string().uuid(),
      id: z.string().uuid().optional(),
      code: z.string().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/, "Lettres, chiffres, - et _ uniquement"),
      type_reduction: z.enum(["pourcentage", "montant_fixe"]),
      valeur: z.number().positive(),
      montant_min_usd: z.number().min(0).default(0),
      date_debut: z.string().datetime().nullable().optional(),
      date_fin: z.string().datetime().nullable().optional(),
      usage_max: z.number().int().positive().nullable().optional(),
      actif: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);
    const { boutique_id, id, ...patch } = data;
    if (id) {
      const { error } = await context.supabase.from("codes_promo").update(patch).eq("id", id).eq("boutique_id", boutique_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("codes_promo").insert({ boutique_id, ...patch });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const boutiqueSupprimerCodePromo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid(), id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const { error } = await context.supabase.from("codes_promo").delete().eq("id", data.id).eq("boutique_id", data.boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
