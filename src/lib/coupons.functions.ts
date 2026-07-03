import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeCouponDiscount } from "@/lib/coupons.server";

export const validateCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        code: z
          .string()
          .trim()
          .min(2)
          .max(40)
          .regex(/^[A-Za-z0-9_-]+$/),
        subtotal: z.number().min(0).max(100000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const result = await computeCouponDiscount(
      supabaseAdmin,
      userId,
      data.code,
      Number(data.subtotal),
    );
    if (!result.ok) return { ok: false as const, error: result.reason };

    return {
      ok: true as const,
      code: result.code,
      type: result.coupon.type,
      value: Number(result.coupon.value),
      description: result.coupon.description,
      discount: result.discount,
    };
  });
