import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- Profile + roles overview ----------
export const getMyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Requêtes essentielles via le client de l'utilisateur (RLS)
    const [profileRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    // Requêtes admin via service_role (optionnelles — ne bloquent pas si la clé manque)
    let vendorData = null;
    let riderData = null;
    try {
      const [vendorRes, riderRes] = await Promise.all([
        supabaseAdmin.from("vendors").select("*").eq("owner_id", userId).maybeSingle(),
        supabaseAdmin.from("riders").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      vendorData = vendorRes.data;
      riderData = riderRes.data;
    } catch (e) {
      console.error("[getMyOverview] supabaseAdmin unavailable:", e);
    }

    return {
      profile: profileRes.data,
      roles: (rolesRes.data ?? []).map((r) => r.role as string),
      vendor: vendorData,
      rider: riderData,
    };
  });

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
      revenueUsd: (orders.data ?? [])
        .filter((o: any) => o.status === "delivered")
        .reduce((s: number, o: any) => s + Number(o.total_usd ?? 0), 0),
      pending: (orders.data ?? []).filter((o: any) => o.status === "pending").length,
    };
    return { vendor, products: products.data ?? [], orders: orders.data ?? [], stats };
  });

// Statistiques enrichies du vendeur : ventes/jour, top produits, revenus (30 jours)
export const getVendorAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("created_at,total_usd,status,items:order_items(product_name,quantity,line_total_usd)")
      .eq("vendor_id", userId)
      .gte("created_at", since)
      .order("created_at");

    const byDay = new Map<string, { commandes: number; revenus: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      byDay.set(d.toISOString().slice(0, 10), { commandes: 0, revenus: 0 });
    }
    let revenue30 = 0, delivered = 0, pending = 0;
    const prod = new Map<string, { qty: number; revenue: number }>();
    for (const o of orders ?? []) {
      const day = (o.created_at as string).slice(0, 10);
      const e = byDay.get(day);
      if (e) { e.commandes++; if (o.status === "delivered") e.revenus += Number(o.total_usd ?? 0); }
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
      daily: Array.from(byDay.entries()).map(([date, v]) => ({ date: date.slice(5), ...v })),
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

// ---------- RIDER ----------
export const applyAsRider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      full_name: z.string().min(2).max(80),
      whatsapp: z.string().min(8).max(20),
      vehicle: z.enum(["moto", "velo", "pied", "voiture"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("riders")
      .insert({
        user_id: userId,
        full_name: data.full_name,
        whatsapp: data.whatsapp,
        vehicle: data.vehicle,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { rider: row };
  });

export const getRiderDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rider } = await supabase.from("riders").select("*").eq("user_id", userId).maybeSingle();
    if (!rider) return { rider: null, myDeliveries: [] };
    const { data: myDeliveries } = await supabase
      .from("orders").select("*").eq("rider_id", userId)
      .order("created_at", { ascending: false }).limit(50);
    return { rider, myDeliveries: myDeliveries ?? [] };
  });

export const toggleRiderAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ available: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("riders").update({ is_available: data.available })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ADMIN ----------
export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw new Error("Forbidden: admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [vendorsRes, ridersRes, productsRes, ordersRes, zonesRes] = await Promise.all([
      supabaseAdmin.from("vendors").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("riders").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("products").select("*").order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("orders").select("*").order("created_at", { ascending: false }).limit(100),
      supabaseAdmin.from("zones").select("*").order("name"),
    ]);
    const orders = ordersRes.data ?? [];

    // Reports queue (open first)
    const { data: reportsRaw } = await supabaseAdmin
      .from("reports")
      .select("*")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(100);
    const reports = reportsRaw ?? [];

    // Enrich: target labels + reporter names
    const productIds = reports.filter((r: any) => r.target_type === "product").map((r: any) => r.target_id);
    const vendorIds = reports.filter((r: any) => r.target_type === "vendor").map((r: any) => r.target_id);
    const riderIds = reports.filter((r: any) => r.target_type === "rider").map((r: any) => r.target_id);
    const reporterIds = Array.from(new Set(reports.map((r: any) => r.reporter_id).filter(Boolean)));

    const [tProducts, tVendors, tRiders, tReporters] = await Promise.all([
      productIds.length ? supabaseAdmin.from("products").select("id,name,emoji").in("id", productIds) : Promise.resolve({ data: [] as any[] }),
      vendorIds.length ? supabaseAdmin.from("vendors").select("id,shop_name,slug").in("id", vendorIds) : Promise.resolve({ data: [] as any[] }),
      riderIds.length ? supabaseAdmin.from("riders").select("id,full_name").in("id", riderIds) : Promise.resolve({ data: [] as any[] }),
      reporterIds.length ? supabaseAdmin.from("profiles").select("id,name,phone").in("id", reporterIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const pMap = new Map((tProducts.data ?? []).map((x: any) => [x.id, x]));
    const vMap = new Map((tVendors.data ?? []).map((x: any) => [x.id, x]));
    const rMap = new Map((tRiders.data ?? []).map((x: any) => [x.id, x]));
    const repMap = new Map((tReporters.data ?? []).map((x: any) => [x.id, x]));
    const reportsEnriched = reports.map((r: any) => ({
      ...r,
      target:
        r.target_type === "product" ? pMap.get(r.target_id) ?? null :
        r.target_type === "vendor" ? vMap.get(r.target_id) ?? null :
        r.target_type === "rider" ? rMap.get(r.target_id) ?? null : null,
      reporter: repMap.get(r.reporter_id) ?? null,
    }));

    return {
      vendors: vendorsRes.data ?? [],
      riders: ridersRes.data ?? [],
      products: productsRes.data ?? [],
      orders,
      zones: zonesRes.data ?? [],
      reports: reportsEnriched,
      stats: {
        totalOrders: orders.length,
        delivered: orders.filter((o: any) => o.status === "delivered").length,
        revenue: orders.filter((o: any) => o.status === "delivered")
          .reduce((s: number, o: any) => s + Number(o.total_usd ?? 0), 0),
        pendingVendors: (vendorsRes.data ?? []).filter((v: any) => v.status === "pending").length,
        pendingRiders: (ridersRes.data ?? []).filter((r: any) => r.status === "pending").length,
        pendingProducts: (productsRes.data ?? []).filter((p: any) => !p.approved).length,
        openReports: reports.filter((r: any) => r.status === "open").length,
      },
    };
  });

export const adminResolveReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      report_id: z.string().uuid(),
      status: z.enum(["reviewing", "resolved", "dismissed", "open"]),
      resolution_note: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const { error } = await supabaseAdmin
      .from("reports")
      .update({
        status: data.status,
        resolution_note: data.resolution_note ?? null,
        resolved_by: data.status === "open" ? null : userId,
      })
      .eq("id", data.report_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateVendorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      vendor_id: z.string().uuid(),
      status: z.enum(["pending", "approved", "suspended", "rejected"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vendor, error } = await supabaseAdmin.from("vendors")
      .update({ status: data.status }).eq("id", data.vendor_id).select().single();
    if (error) throw new Error(error.message);
    // Auto-grant vendor role on first approval
    if (data.status === "approved" && vendor) {
      await supabaseAdmin.from("user_roles")
        .upsert({ user_id: vendor.owner_id, role: "vendor" }, { onConflict: "user_id,role" });
    }
    return { ok: true };
  });

export const adminUpdateRiderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      rider_id: z.string().uuid(),
      status: z.enum(["pending", "active", "offline", "suspended"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rider, error } = await supabaseAdmin.from("riders")
      .update({ status: data.status }).eq("id", data.rider_id).select().single();
    if (error) throw new Error(error.message);
    if (data.status === "active" && rider) {
      await supabaseAdmin.from("user_roles")
        .upsert({ user_id: rider.user_id, role: "rider" }, { onConflict: "user_id,role" });
    }
    return { ok: true };
  });

export const adminApproveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ product_id: z.string().uuid(), approved: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("products")
      .update({ approved: data.approved }).eq("id", data.product_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getZones = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("zones").select("*").eq("active", true).order("name");
  return { zones: data ?? [] };
});

// ---------- CUSTOMER ----------
export const getCustomerOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: order, error } = await supabase
      .from("orders").select("*").eq("id", data.order_id).eq("customer_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Commande introuvable");
    const [items, history, review] = await Promise.all([
      supabase.from("order_items").select("*").eq("order_id", data.order_id),
      supabase.from("order_status_history").select("*").eq("order_id", data.order_id).order("created_at"),
      supabase.from("reviews").select("*").eq("order_id", data.order_id).eq("author_id", userId).maybeSingle(),
    ]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Contact du livreur assigné (le client possède la commande → autorisé à le joindre)
    let rider: { full_name: string; whatsapp: string; vehicle: string } | null = null;
    if (order.rider_id) {
      const { data: r } = await supabaseAdmin
        .from("riders")
        .select("full_name,whatsapp,vehicle")
        .eq("user_id", order.rider_id)
        .maybeSingle();
      rider = r ?? null;
    }

    // Instructions Mobile Money du vendeur (si le client a choisi un paiement mobile)
    let mobileMoney: { number: string; name: string | null; operator: string } | null = null;
    const mmMethods = ["mpesa", "airtel_money", "orange_money"];
    if (order.vendor_id && mmMethods.includes(order.payment_method as string)) {
      const { data: v } = await supabaseAdmin
        .from("vendors")
        .select("mobile_money_number,mobile_money_name")
        .eq("owner_id", order.vendor_id)
        .maybeSingle();
      if (v?.mobile_money_number) {
        mobileMoney = { number: v.mobile_money_number, name: v.mobile_money_name ?? null, operator: order.payment_method as string };
      }
    }

    return { order, items: items.data ?? [], history: history.data ?? [], review: review.data ?? null, rider, mobileMoney };
  });

// Suivi en temps réel du livreur (le client poll cette fonction quand sa commande est en route)
export const getDeliveryTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: order } = await supabase
      .from("orders")
      .select("id,customer_id,rider_id")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order || order.customer_id !== userId) return { ok: false as const, reason: "forbidden" };
    if (!order.rider_id) return { ok: false as const, reason: "no_rider" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rider } = await supabaseAdmin
      .from("riders")
      .select("current_lat,current_lng,updated_at,full_name")
      .eq("user_id", order.rider_id)
      .maybeSingle();
    if (rider?.current_lat == null || rider?.current_lng == null) {
      return { ok: false as const, reason: "no_location" };
    }
    return {
      ok: true as const,
      lat: Number(rider.current_lat),
      lng: Number(rider.current_lng),
      updated_at: rider.updated_at,
      name: rider.full_name,
    };
  });

// Le livreur pousse sa position GPS (partage en direct pendant la course)
export const riderUpdateLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("riders")
      .update({ current_lat: data.lat, current_lng: data.lng })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const customerCancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: o, error: e1 } = await supabase.from("orders")
      .select("status,customer_id").eq("id", data.order_id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!o || o.customer_id !== userId) throw new Error("Non autorisé");
    if (o.status !== "pending") throw new Error("Seules les commandes en attente peuvent être annulées");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", data.order_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const customerLeaveReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    order_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(500).optional(),
    target: z.enum(["product", "vendor", "rider"]).default("product"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: o, error: e1 } = await supabase.from("orders")
      .select("id,product_id,vendor_id,rider_id,status,customer_id").eq("id", data.order_id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!o || o.customer_id !== userId) throw new Error("Non autorisé");
    if (o.status !== "delivered") throw new Error("Tu pourras noter après livraison");
    const { error } = await supabase.from("reviews").insert({
      order_id: o.id,
      author_id: userId,
      target: data.target,
      product_id: data.target === "product" ? o.product_id : null,
      vendor_id: data.target === "vendor" ? o.vendor_id : null,
      rider_id: data.target === "rider" ? o.rider_id : null,
      rating: data.rating,
      comment: data.comment ?? null,
    });
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

// ---------- RIDER extras ----------
export const getAvailableDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rider } = await supabase.from("riders").select("id,status,is_available").eq("user_id", userId).maybeSingle();
    if (!rider || rider.status !== "active") return { orders: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id,code,zone,customer_address,customer_name,customer_lat,customer_lng,total_usd,delivery_fee,status,created_at")
      .is("rider_id", null)
      .in("status", ["confirmed", "ready"])
      .order("created_at", { ascending: true })
      .limit(30);
    if (error) throw new Error(error.message);
    return { orders: data ?? [] };
  });

export const riderClaimOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rider } = await supabase.from("riders").select("id,status").eq("user_id", userId).maybeSingle();
    if (!rider || rider.status !== "active") throw new Error("Compte livreur non actif");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("orders").update({ rider_id: userId })
      .eq("id", data.order_id).is("rider_id", null).select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Course déjà prise");
    await supabaseAdmin.from("deliveries").insert({
      order_id: data.order_id, rider_id: rider.id, status: "assigned",
      rider_fee_usd: Number(updated.delivery_fee ?? 0),
    });
    return { ok: true };
  });

export const riderUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    order_id: z.string().uuid(),
    status: z.enum(["picked_up", "delivered", "cancelled"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("orders").update({ status: data.status })
      .eq("id", data.order_id).eq("rider_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const riderConfirmCash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid(), amount_usd: z.number().positive() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: o, error: e1 } = await supabase.from("orders").select("rider_id").eq("id", data.order_id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!o || o.rider_id !== userId) throw new Error("Non autorisé");
    const { error } = await supabase.from("payments").insert({
      order_id: data.order_id, method: "cash", status: "paid",
      amount_usd: data.amount_usd, collected_by: userId, collected_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("orders").update({ payment_status: "paid" }).eq("id", data.order_id);
    return { ok: true };
  });

// ---------- ADMIN zones ----------
export const adminUpsertZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(2).max(80),
    delivery_fee_usd: z.number().min(0).max(100),
    active: z.boolean().default(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r) => r.role === "admin")) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { error } = await supabaseAdmin.from("zones").update({
        name: data.name, delivery_fee_usd: data.delivery_fee_usd, active: data.active,
      }).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("zones").insert({
        name: data.name, delivery_fee_usd: data.delivery_fee_usd, active: data.active,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- ADMIN: user & role management ----------
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Forbidden: admin only");
}

// ---------- ADMIN: taux de change USD -> CDF ----------
export const adminUpdateCdfRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ rate: z.number().int("Taux entier en FC").min(100).max(100000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert(
        { key: "cdf_rate", value: String(data.rate), updated_at: new Date().toISOString() },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, rate: data.rate };
  });

export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ search: z.string().max(120).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("profiles").select("id,name,phone,zone,avatar_url,created_at").order("created_at", { ascending: false }).limit(200);
    const s = (data.search ?? "").trim();
    if (s) q = q.or(`name.ilike.%${s}%,phone.ilike.%${s}%`);
    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p: any) => p.id);
    const { data: roleRows } = ids.length
      ? await supabaseAdmin.from("user_roles").select("user_id,role").in("user_id", ids)
      : { data: [] as any[] };
    const byUser = new Map<string, string[]>();
    (roleRows ?? []).forEach((r: any) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    });
    return {
      users: (profiles ?? []).map((p: any) => ({ ...p, roles: byUser.get(p.id) ?? [] })),
    };
  });

export const adminGrantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    role: z.enum(["customer", "vendor", "rider", "admin"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_roles")
      .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRevokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    user_id: z.string().uuid(),
    role: z.enum(["customer", "vendor", "rider", "admin"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.user_id === context.userId && data.role === "admin") {
      throw new Error("Tu ne peux pas retirer ton propre rôle admin.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_roles")
      .delete().eq("user_id", data.user_id).eq("role", data.role);
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

// ---------- ADMIN: analytics ----------
export const getAdminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("created_at,total_usd,status")
      .gte("created_at", since)
      .order("created_at");

    const byDay = new Map<string, { commandes: number; revenus: number }>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      byDay.set(d.toISOString().slice(0, 10), { commandes: 0, revenus: 0 });
    }
    for (const o of orders ?? []) {
      const day = (o.created_at as string).slice(0, 10);
      const entry = byDay.get(day);
      if (entry) {
        entry.commandes++;
        if (o.status === "delivered") entry.revenus += Number(o.total_usd ?? 0);
      }
    }
    return {
      daily: Array.from(byDay.entries()).map(([date, v]) => ({
        date: date.slice(5),
        ...v,
      })),
    };
  });

// ---------- ADMIN: vue d'ensemble (pilotage quotidien) ----------
// Bunia / Ituri = CAT (UTC+2). On calcule les bornes "aujourd'hui"/"hier" dans ce fuseau
// pour que les chiffres collent à la journée réelle du gérant, pas à l'UTC.
const BUNIA_TZ_OFFSET_MS = 2 * 60 * 60 * 1000;
function startOfLocalDayUtc(ts: number): number {
  const local = new Date(ts + BUNIA_TZ_OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - BUNIA_TZ_OFFSET_MS;
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const startToday = startOfLocalDayUtc(now);
    const startYesterday = startToday - DAY;
    const since7 = now - 7 * DAY;
    const since30 = now - 30 * DAY;

    const [ordersRes, vendorsRes, ridersRes, customersHead, newCustomersHead] = await Promise.all([
      supabaseAdmin
        .from("orders")
        .select("created_at,total_usd,status,zone,payment_status")
        .gte("created_at", new Date(since30).toISOString()),
      supabaseAdmin.from("vendors").select("status"),
      supabaseAdmin.from("riders").select("status,is_available"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", new Date(since7).toISOString()),
    ]);

    const orders = ordersRes.data ?? [];
    const vendors = vendorsRes.data ?? [];
    const riders = ridersRes.data ?? [];
    const tms = (o: any) => new Date(o.created_at as string).getTime();
    const delivered = (o: any) => o.status === "delivered";

    const window = (from: number, to: number) => {
      const inWin = orders.filter((o) => tms(o) >= from && tms(o) < to);
      const deliv = inWin.filter(delivered);
      return {
        orders: inWin.length,
        revenue: deliv.reduce((s, o) => s + Number(o.total_usd ?? 0), 0),
        delivered: deliv.length,
      };
    };

    const today = window(startToday, now + 1);
    const yesterday = window(startYesterday, startToday);
    const week = window(since7, now + 1);

    // Tendance jour vs hier (% commandes)
    const trendOrders = yesterday.orders === 0
      ? (today.orders > 0 ? 100 : 0)
      : Math.round(((today.orders - yesterday.orders) / yesterday.orders) * 100);

    // Zones chaudes : top quartiers par nombre de commandes (7 derniers jours)
    const zoneMap = new Map<string, { orders: number; revenue: number }>();
    for (const o of orders) {
      if (tms(o) < since7) continue;
      const z = (o.zone as string) || "—";
      const e = zoneMap.get(z) ?? { orders: 0, revenue: 0 };
      e.orders++;
      if (delivered(o)) e.revenue += Number(o.total_usd ?? 0);
      zoneMap.set(z, e);
    }
    const hotZones = Array.from(zoneMap.entries())
      .map(([zone, v]) => ({ zone, ...v }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 6);

    // Cash à encaisser : commandes livrées mais non payées (30 j)
    const cashToCollect = orders
      .filter((o) => delivered(o) && o.payment_status !== "paid")
      .reduce((s, o) => s + Number(o.total_usd ?? 0), 0);

    const avgBasket = week.delivered > 0 ? week.revenue / week.delivered : 0;

    return {
      today: { orders: today.orders, revenue: today.revenue, trendOrders },
      week: { orders: week.orders, revenue: week.revenue, avgBasket },
      network: {
        vendorsActive: vendors.filter((v: any) => v.status === "approved").length,
        vendorsPending: vendors.filter((v: any) => v.status === "pending").length,
        ridersActive: riders.filter((r: any) => r.status === "active").length,
        ridersOnline: riders.filter((r: any) => r.status === "active" && r.is_available).length,
        customers: customersHead.count ?? 0,
        newCustomers7d: newCustomersHead.count ?? 0,
      },
      cashToCollect,
      hotZones,
    };
  });

// ---------- ADMIN: taux de change CDF ----------
export const adminSetCdfRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ rate: z.number().positive().max(100000) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "cdf_rate", value: String(data.rate) }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ADMIN: coupons ----------
export const adminListCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { coupons: data ?? [] };
  });

export const adminUpsertCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid().optional(),
      code: z.string().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
      description: z.string().max(200).nullable().optional(),
      type: z.enum(["fixed", "percent"]),
      value: z.number().positive().max(100000),
      min_order_usd: z.number().min(0).default(0),
      max_discount_usd: z.number().positive().nullable().optional(),
      max_uses: z.number().int().positive().nullable().optional(),
      max_uses_per_user: z.number().int().min(0).default(1),
      starts_at: z.string().nullable().optional(),
      expires_at: z.string().nullable().optional(),
      active: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const code = data.code.toUpperCase();
    const payload = {
      code,
      description: data.description ?? null,
      type: data.type,
      value: data.value,
      min_order_usd: data.min_order_usd,
      max_discount_usd: data.max_discount_usd ?? null,
      max_uses: data.max_uses ?? null,
      max_uses_per_user: data.max_uses_per_user,
      starts_at: data.starts_at ? new Date(data.starts_at).toISOString() : null,
      expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : null,
      active: data.active,
    };
    if (data.id) {
      const { error } = await supabaseAdmin.from("coupons").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("coupons").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });