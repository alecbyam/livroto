import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bucketOrdersByDay, isDelivered, sumRevenueUsd } from "@/lib/order-stats";

// Garde d'accès admin centralisée — évite de dupliquer la vérification de rôle
// dans chaque handler admin (une copie oubliée/mal faite = trou de sécurité).
async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Forbidden: admin only");
}

// ---------- ADMIN ----------
export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

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
        delivered: orders.filter(isDelivered).length,
        revenue: sumRevenueUsd(orders.filter(isDelivered)),
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
    await assertAdmin(context);
    const { userId } = context;
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
    await assertAdmin(context);
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
    await assertAdmin(context);
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
    await assertAdmin(context);
    const { error } = await supabaseAdmin.from("products")
      .update({ approved: data.approved }).eq("id", data.product_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ADMIN: valider / activer / couper une promo ----------
export const adminSetPromoApproved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ product_id: z.string().uuid(), approved: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await supabaseAdmin.from("products")
      .update({ promo_approved: data.approved } as never).eq("id", data.product_id);
    if (error) throw new Error(error.message);
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
    await assertAdmin(context);
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

// ---------- ADMIN: taux de change USD -> CDF ----------
export const adminUpdateCdfRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ rate: z.number().int("Taux entier en FC").min(100).max(100000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
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
    const { error } = await supabaseAdmin.from("user_roles")
      .delete().eq("user_id", data.user_id).eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ADMIN: analytics ----------
export const getAdminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: orders } = await supabaseAdmin
      .from("orders")
      .select("created_at,total_usd,status")
      .gte("created_at", since)
      .order("created_at");

    return { daily: bucketOrdersByDay(orders ?? [], 30) };
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

    const window = (from: number, to: number) => {
      const inWin = orders.filter((o) => tms(o) >= from && tms(o) < to);
      const deliv = inWin.filter(isDelivered);
      return {
        orders: inWin.length,
        revenue: sumRevenueUsd(deliv),
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
      if (isDelivered(o)) e.revenue += Number(o.total_usd ?? 0);
      zoneMap.set(z, e);
    }
    const hotZones = Array.from(zoneMap.entries())
      .map(([zone, v]) => ({ zone, ...v }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 6);

    // Cash à encaisser : commandes livrées mais non payées (30 j)
    const cashToCollect = sumRevenueUsd(
      orders.filter((o) => isDelivered(o) && o.payment_status !== "paid"),
    );

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
