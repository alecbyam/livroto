import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const cartItem = z.object({
  id: z.string(),
  name: z.string(),
  price_usd: z.number(),
  original_price_usd: z.number().nullable().optional(),
  emoji: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  vendor_id: z.string().nullable(),
  stock: z.number(),
  qty: z.number().int().min(1),
});

// Type concret (sérialisable) pour le retour de getMyCart — évite `unknown[]`
// que la sérialisation des server functions TanStack Start refuse.
export type CartItemPayload = z.infer<typeof cartItem>;

export const getMyCart = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("carts")
      .select("items")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { items: (data?.items ?? []) as CartItemPayload[] };
  });

export const saveMyCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ items: z.array(cartItem).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("carts")
      .upsert(
        { user_id: userId, items: data.items, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
