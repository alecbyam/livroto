// Règles de calcul/validation d'un coupon — extrait de coupons.functions.ts
// pour être réutilisé par la création de commande (autorité serveur), qui ne
// peut pas faire confiance au `discount` calculé côté client.

export type CouponDiscountResult =
  | { ok: true; code: string; discount: number; coupon: any }
  | { ok: false; reason: string };

export async function computeCouponDiscount(
  admin: any,
  userId: string,
  rawCode: string,
  subtotal: number,
): Promise<CouponDiscountResult> {
  const code = rawCode.trim().toUpperCase();

  const { data: coupon, error } = await admin
    .from("coupons")
    .select("*")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!coupon) return { ok: false, reason: "Code introuvable" };

  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now)
    return { ok: false, reason: "Code pas encore actif" };
  if (coupon.expires_at && new Date(coupon.expires_at) < now)
    return { ok: false, reason: "Code expiré" };
  if (subtotal < Number(coupon.min_order_usd))
    return { ok: false, reason: `Commande minimum $${Number(coupon.min_order_usd).toFixed(2)}` };
  if (coupon.max_uses != null && coupon.uses_count >= coupon.max_uses)
    return { ok: false, reason: "Code épuisé" };

  if (coupon.max_uses_per_user > 0) {
    const { count } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", userId)
      .eq("coupon_code", code);
    if ((count ?? 0) >= coupon.max_uses_per_user)
      return { ok: false, reason: "Tu as déjà utilisé ce code" };
  }

  let discount =
    coupon.type === "percent" ? (subtotal * Number(coupon.value)) / 100 : Number(coupon.value);
  if (coupon.max_discount_usd != null)
    discount = Math.min(discount, Number(coupon.max_discount_usd));
  discount = Math.min(discount, subtotal);
  discount = Math.round(discount * 100) / 100;

  return { ok: true, code, discount, coupon };
}
