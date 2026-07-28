import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";
import { genererFacturePdf } from "@/lib/boutiques/facture-pdf.server";

const PAGE_SIZE = 30;

export const boutiqueListerFactures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ boutique_id: z.string().uuid(), offset: z.number().int().min(0).default(0) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    const { data: rows, error, count } = await context.supabase
      .from("factures")
      .select("id,numero,pdf_url,created_at,ventes(numero,canal,total_usd,mode_paiement)", { count: "exact" })
      .eq("boutique_id", data.boutique_id)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

// Régénération manuelle (souci réseau lors de l'encaissement, PDF jamais
// produit, ou besoin de le régénérer après une correction de coordonnées de
// la boutique).
export const boutiqueRegenererFacturePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid(), facture_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur"]);
    const { data: facture, error } = await context.supabase
      .from("factures")
      .select("id")
      .eq("id", data.facture_id)
      .eq("boutique_id", data.boutique_id)
      .single();
    if (error) throw new Error(error.message);
    const pdf_url = await genererFacturePdf(facture.id);
    return { pdf_url };
  });
