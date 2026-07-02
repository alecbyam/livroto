import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bucketOrdersByDay, isDelivered, sumRevenueUsd } from "@/lib/order-stats";

// ---------- VENDOR ----------
export const applyAsVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      shop_name: z.string().min(2).max(80),
      whatsapp: z.string().min(8).max(20),
      description: z.string().max(500).optional(),
      base_zone_id: z.string().uuid().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const slug = data.shop_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + "-" + userId.slice(0, 6);
    const { data: row, error } = await supabase
      .from("vendors")
      .insert({
        owner_id: userId,
        shop_name: data.shop_name,
        slug,
        whatsapp: data.whatsapp,
        description: data.description ?? null,
        base_zone_id: data.base_zone_id ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { vendor: row };
  });

export const getVendorDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: vendor } = await supabaseAdmin.from("vendors").select("*").eq("owner_id", userId).maybeSingle();
    if (!vendor) return { vendor: null, products: [], orders: [], stats: null };
    const [products, orders] = await Promise.all([
      supabase.from("products").select("*, subcategory:product_subcategories(name,emoji)").eq("vendor_id", userId).order("created_at", { ascending: false }),
      supabase.from("orders").select("*, items:order_items(product_name,quantity,unit_price_usd,line_total_usd)").eq("vendor_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);
    const stats = {
      productsCount: products.data?.length ?? 0,
      ordersCount: orders.data?.length ?? 0,
      revenueUsd: sumRevenueUsd((orders.data ?? []).filter(isDelivered)),
      pending: (orders.data ?? []).filter((o: any) => o.status === "pending").length,
    };
    return { vendor, products: products.data ?? [], orders: orders.data ?? [], stats };
  });

// Statistiques enrichies du vendeur : ventes/jour, top produits, revenus (30 jours)
export const getVendorAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("created_at,total_usd,status,items:order_items(product_name,quantity,line_total_usd)")
      .eq("vendor_id", userId)
      .gte("created_at", since)
      .order("created_at");

    const daily = bucketOrdersByDay(orders ?? [], 14);

    let revenue30 = 0, delivered = 0, pending = 0;
    const prod = new Map<string, { qty: number; revenue: number }>();
    for (const o of orders ?? []) {
      if (o.status === "delivered") { delivered++; revenue30 += Number(o.total_usd ?? 0); }
      if (o.status === "pending") pending++;
      for (const it of ((o as any).items ?? [])) {
        const cur = prod.get(it.product_name) ?? { qty: 0, revenue: 0 };
        cur.qty += Number(it.quantity ?? 0);
        cur.revenue += Number(it.line_total_usd ?? 0);
        prod.set(it.product_name, cur);
      }
    }
    const topProducts = Array.from(prod.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
    return {
      daily,
      topProducts,
      totals: { orders: (orders ?? []).length, delivered, pending, revenue30 },
    };
  });

export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      name: z.string().min(2).max(120),
      category: z.enum([
        "phone_accessories",
        "local_food",
        "delivery_service",
        "home_tools",
        "beauty",
        "jewelry",
        "watches",
        "computers",
        "electronics",
      ]),
      price_usd: z.number().positive().max(10000),
      stock: z.number().int().min(0).max(100000),
      emoji: z.string().max(8).optional(),
      description: z.string().max(800).optional(),
      unit: z.string().max(20).optional(),
      subcategory_id: z.string().uuid(),
      image_url: z.string().url().max(1000).optional(),
      images: z.array(z.string().url().max(1000)).max(5).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const imgs = (data.images && data.images.length > 0)
      ? data.images
      : (data.image_url ? [data.image_url] : []);
    const { data: row, error } = await supabase
      .from("products")
      .insert({
        vendor_id: userId,
        name: data.name,
        category: data.category,
        subcategory_id: data.subcategory_id ?? null,
        price_usd: data.price_usd,
        stock: data.stock,
        emoji: data.emoji ?? null,
        description: data.description ?? null,
        unit: data.unit ?? "piece",
        image_url: imgs[0] ?? null,
        images: imgs,
        approved: false,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { product: row };
  });

export const updateOrderStatusVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      order_id: z.string().uuid(),
      status: z.enum(["pending", "confirmed", "ready", "picked_up", "delivered", "cancelled"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("orders").update({ status: data.status })
      .eq("id", data.order_id).eq("vendor_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- VENDOR extras ----------
export const vendorUpdateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    product_id: z.string().uuid(),
    price_usd: z.number().positive().max(10000).optional(),
    stock: z.number().int().min(0).max(100000).optional(),
    description: z.string().max(800).optional(),
    name: z.string().min(2).max(120).optional(),
    images: z.array(z.string().url().max(1000)).max(5).optional(),
    // Promo : le vendeur propose ; la validation (promo_approved) reste à l'admin
    // (un trigger DB remet promo_approved=false à toute modif des termes par le vendeur).
    promo_price_usd: z.number().min(0).max(10000).nullable().optional(),
    promo_starts_at: z.string().datetime().nullable().optional(),
    promo_ends_at: z.string().datetime().nullable().optional(),
    promo_active: z.boolean().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { product_id, ...patch } = data;
    const finalPatch: any = { ...patch };
    if (patch.images) {
      finalPatch.image_url = patch.images[0] ?? null;
    }
    const { error } = await supabase.from("products").update(finalPatch).eq("id", product_id).eq("vendor_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const vendorDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ product_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("products").delete().eq("id", data.product_id).eq("vendor_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- VENDOR: update shop ----------
export const vendorUpdateShop = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      shop_name: z.string().min(2).max(80).optional(),
      description: z.string().max(500).nullable().optional(),
      whatsapp: z.string().min(8).max(20).optional(),
      logo_url: z.string().url().max(1000).nullable().optional(),
      cover_url: z.string().url().max(1000).nullable().optional(),
      mobile_money_number: z.string().max(30).nullable().optional(),
      mobile_money_name: z.string().max(80).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    if (data.shop_name !== undefined) patch.shop_name = data.shop_name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.whatsapp !== undefined) patch.whatsapp = data.whatsapp;
    if (data.logo_url !== undefined) patch.logo_url = data.logo_url;
    if (data.cover_url !== undefined) patch.cover_url = data.cover_url;
    if (data.mobile_money_number !== undefined) patch.mobile_money_number = data.mobile_money_number;
    if (data.mobile_money_name !== undefined) patch.mobile_money_name = data.mobile_money_name;
    const { error } = await supabase.from("vendors").update(patch as never).eq("owner_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
