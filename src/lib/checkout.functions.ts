import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPromo } from "@/lib/promo";
import { computeCouponDiscount } from "@/lib/coupons.server";

// Autorité serveur pour la création de commande : le client ne fournit que des
// identifiants produit + quantités. Prix, remise coupon et frais de livraison
// sont recalculés ici depuis la base — jamais acceptés tels quels du client
// (voir audit du 2 juillet 2026 : subtotal_usd/total_usd étaient insérés
// directement depuis des valeurs calculées en JS côté navigateur).

const PAYMENT_METHODS = ["cash", "mpesa", "airtel_money", "orange_money"] as const;

const checkoutInput = z.object({
  items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(50),
  zone_id: z.string().uuid().nullable(),
  coupon_code: z.string().trim().min(2).max(40).nullable(),
  customer_name: z.string().trim().min(1).max(120),
  customer_phone: z.string().trim().min(3).max(40),
  customer_address: z.string().trim().min(1).max(500),
  payment_method: z.enum(PAYMENT_METHODS),
  customer_notes: z.string().trim().max(500).nullable(),
  customer_lat: z.number().nullable(),
  customer_lng: z.number().nullable(),
});

type ProductRow = {
  id: string;
  name: string;
  vendor_id: string | null;
  price_usd: number;
  promo_price_usd: number | null;
  promo_active: boolean | null;
  promo_approved: boolean | null;
  promo_starts_at: string | null;
  promo_ends_at: string | null;
};

async function resolveZone(admin: any, zoneId: string | null) {
  if (!zoneId) return { zoneName: "", deliveryFee: 0, zoneRowId: null as string | null };
  const { data: zone } = await admin
    .from("zones")
    .select("id,name,delivery_fee_usd")
    .eq("id", zoneId)
    .eq("active", true)
    .maybeSingle();
  if (!zone) return { zoneName: "", deliveryFee: 0, zoneRowId: null as string | null };
  return {
    zoneName: zone.name as string,
    deliveryFee: Number(zone.delivery_fee_usd),
    zoneRowId: zone.id as string,
  };
}

/** Panier multi-vendeur : une commande par vendeur, remise coupon répartie sur le 1ᵉʳ groupe (comme avant). */
export const createCartOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => checkoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const productIds = [...new Set(data.items.map((i) => i.product_id))];
    const { data: products, error: prodErr } = await admin
      .from("products")
      .select(
        "id,name,vendor_id,price_usd,promo_price_usd,promo_active,promo_approved,promo_starts_at,promo_ends_at",
      )
      .in("id", productIds);
    if (prodErr) throw new Error(prodErr.message);

    const byId = new Map<string, ProductRow>((products ?? []).map((p: ProductRow) => [p.id, p]));
    for (const it of data.items) {
      if (!byId.has(it.product_id))
        throw new Error("Un produit du panier est introuvable ou n'est plus au catalogue");
    }

    const { zoneName, deliveryFee, zoneRowId } = await resolveZone(admin, data.zone_id);

    type Line = {
      productId: string;
      name: string;
      vendorId: string | null;
      qty: number;
      unitPrice: number;
      lineTotal: number;
    };
    const groups = new Map<string, Line[]>();
    for (const it of data.items) {
      const p = byId.get(it.product_id)!;
      const unitPrice = getPromo(p).price;
      const key = p.vendor_id ?? "__nov__";
      const arr = groups.get(key) ?? [];
      arr.push({
        productId: p.id,
        name: p.name,
        vendorId: p.vendor_id,
        qty: it.quantity,
        unitPrice,
        lineTotal: unitPrice * it.quantity,
      });
      groups.set(key, arr);
    }
    const groupList = Array.from(groups.entries()).map(([vendorKey, lines]) => ({
      vendorId: vendorKey === "__nov__" ? null : vendorKey,
      lines,
      subtotal: lines.reduce((s, l) => s + l.lineTotal, 0),
    }));
    const subtotal = groupList.reduce((s, g) => s + g.subtotal, 0);

    let discount = 0;
    let appliedCode: string | null = null;
    if (data.coupon_code) {
      const result = await computeCouponDiscount(admin, userId, data.coupon_code, subtotal);
      if (result.ok) {
        discount = result.discount;
        appliedCode = result.code;
      }
    }

    let discountLeft = discount;
    const createdOrders: { id: string; code: string | null }[] = [];
    for (const g of groupList) {
      const groupDiscount = Math.min(discountLeft, g.subtotal);
      discountLeft -= groupDiscount;
      const groupTotal = Math.max(0, g.subtotal - groupDiscount);
      const first = g.lines[0];
      const totalQty = g.lines.reduce((s, l) => s + l.qty, 0);

      const { data: order, error: oErr } = await admin
        .from("orders")
        .insert({
          customer_id: userId,
          customer_name: data.customer_name,
          customer_phone: data.customer_phone,
          customer_address: data.customer_address,
          zone: zoneName,
          zone_id: zoneRowId,
          product_id: first.productId,
          vendor_id: g.vendorId,
          quantity: totalQty,
          subtotal_usd: g.subtotal,
          total_usd: groupTotal,
          delivery_fee: deliveryFee,
          payment_method: data.payment_method,
          customer_notes: data.customer_notes || null,
          coupon_code: appliedCode && groupDiscount > 0 ? appliedCode : null,
          discount_usd: groupDiscount,
          customer_lat: data.customer_lat,
          customer_lng: data.customer_lng,
        })
        .select("id,code")
        .single();
      if (oErr) throw new Error(oErr.message);

      const lines = g.lines.map((l) => ({
        order_id: order.id,
        product_id: l.productId,
        vendor_id: g.vendorId,
        product_name: l.name,
        unit_price_usd: l.unitPrice,
        quantity: l.qty,
        line_total_usd: l.lineTotal,
      }));
      const { error: liErr } = await admin.from("order_items").insert(lines);
      if (liErr) throw new Error(liErr.message);

      createdOrders.push({ id: order.id as string, code: (order.code as string) ?? null });
    }

    if (appliedCode && discount > 0) {
      await admin.rpc("increment_coupon_uses", { p_code: appliedCode }).catch(() => {});
    }

    return {
      orders: createdOrders,
      subtotal,
      discount,
      zoneName,
      deliveryFee,
      deliveryTotal: deliveryFee * Math.max(1, groupList.length),
    };
  });

const directOrderInput = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  zone_id: z.string().uuid().nullable(),
  customer_name: z.string().trim().min(1).max(120),
  customer_phone: z.string().trim().min(3).max(40),
  customer_address: z.string().trim().min(1).max(500),
  payment_method: z.enum(PAYMENT_METHODS),
  customer_lat: z.number().nullable(),
  customer_lng: z.number().nullable(),
});

/** Achat direct « Commander maintenant » : un seul produit, un seul vendeur, pas de coupon (comme avant). */
export const createDirectOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => directOrderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: product, error: prodErr } = await admin
      .from("products")
      .select(
        "id,name,vendor_id,price_usd,promo_price_usd,promo_active,promo_approved,promo_starts_at,promo_ends_at",
      )
      .eq("id", data.product_id)
      .maybeSingle();
    if (prodErr) throw new Error(prodErr.message);
    if (!product) throw new Error("Produit introuvable ou retiré du catalogue");

    const { zoneName, deliveryFee, zoneRowId } = await resolveZone(admin, data.zone_id);

    const unitPrice = getPromo(product as ProductRow).price;
    const subtotal = unitPrice * data.quantity;

    const { data: order, error: oErr } = await admin
      .from("orders")
      .insert({
        customer_id: userId,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        customer_address: data.customer_address,
        zone: zoneName,
        zone_id: zoneRowId,
        product_id: product.id,
        vendor_id: product.vendor_id,
        quantity: data.quantity,
        subtotal_usd: subtotal,
        total_usd: subtotal,
        delivery_fee: deliveryFee,
        payment_method: data.payment_method,
        customer_lat: data.customer_lat,
        customer_lng: data.customer_lng,
      })
      .select("id,code")
      .single();
    if (oErr) throw new Error(oErr.message);

    // Best-effort comme avant : une ligne d'article manquante n'annule pas la commande.
    await admin
      .from("order_items")
      .insert({
        order_id: order.id,
        product_id: product.id,
        vendor_id: product.vendor_id,
        product_name: product.name,
        unit_price_usd: unitPrice,
        quantity: data.quantity,
        line_total_usd: subtotal,
      })
      .then(({ error }: { error: any }) => {
        if (error) console.warn("[createDirectOrder] order_items insert failed:", error.message);
      });

    return {
      orderId: order.id as string,
      code: (order.code as string) ?? null,
      subtotal,
      deliveryFee,
      zoneName,
    };
  });
