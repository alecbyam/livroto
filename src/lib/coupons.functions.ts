import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
      subtotal: z.number().min(0).max(100000),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const code = data.code.toUpperCase();

    const { data: coupon, error } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .eq("code", code)
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!coupon) return { ok: false as const, error: "Code introuvable" };

    const now = new Date();
    if (coupon.starts_at && new Date(coupon.starts_at) > now)
      return { ok: false as const, error: "Code pas encore actif" };
    if (coupon.expires_at && new Date(coupon.expires_at) < now)
      return { ok: false as const, error: "Code expiré" };
    if (Number(data.subtotal) < Number(coupon.min_order_usd))
      return {
        ok: false as const,
        error: `Commande minimum $${Number(coupon.min_order_usd).toFixed(2)}`,
      };
    if (coupon.max_uses != null && coupon.uses_count >= coupon.max_uses)
      return { ok: false as const, error: "Code épuisé" };

    // Per-user limit: count previous orders by this user with this coupon
    if (coupon.max_uses_per_user > 0) {
      const { count } = await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", userId)
        .eq("coupon_code", code);
      if ((count ?? 0) >= coupon.max_uses_per_user)
        return { ok: false as const, error: "Tu as déjà utilisé ce code" };
    }

    let discount = coupon.type === "percent"
      ? (Number(data.subtotal) * Number(coupon.value)) / 100
      : Number(coupon.value);
    if (coupon.max_discount_usd != null)
      discount = Math.min(discount, Number(coupon.max_discount_usd));
    discount = Math.min(discount, Number(data.subtotal));
    discount = Math.round(discount * 100) / 100;

    return {
      ok: true as const,
      code,
      type: coupon.type,
      value: Number(coupon.value),
      description: coupon.description,
      discount,
    };
  });

// Incrément atomique uses_count via RPC Postgres.
// L'approche read-then-write précédente avait une race condition :
// deux commandes simultanées pouvaient lire uses_count=5 et toutes deux écrire 6.
export const recordCouponUse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ code: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/) }).parse(input),
  )
  .handler(async ({ data }) => {
    const code = data.code.toUpperCase();
    const { error } = await supabaseAdmin.rpc("increment_coupon_uses", { p_code: code });
    if (error) return { ok: false };
    return { ok: true };
  });