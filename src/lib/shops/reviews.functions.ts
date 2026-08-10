// ============================================================================
// Avis client — module boutique générique. Un avis par commande LIVRÉE
// uniquement (contrainte unique + RLS shop_reviews_customer_insert). La
// lecture publique passe directement par le client anon (RLS deny-tout sauf
// boutique approuvée) — pas besoin de server function pour ça.
// ============================================================================
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const customerLeaveShopReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    order_id: z.string().uuid(),
    shop_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("shop_reviews").insert({
      order_id: data.order_id,
      shop_id: data.shop_id,
      customer_id: context.userId,
      rating: data.rating,
      comment: data.comment || null,
    });
    if (error) {
      if (error.code === "23505") throw new Error("Tu as déjà laissé un avis pour cette commande.");
      throw new Error(error.message);
    }
    return { ok: true };
  });
