import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

// ---------- RIDER extras ----------
export const getAvailableDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rider } = await supabase.from("riders").select("id,status,is_available").eq("user_id", userId).maybeSingle();
    if (!rider || rider.status !== "active") return { orders: [] };
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
    await supabaseAdmin.from("orders").update({ payment_status: "paid" }).eq("id", data.order_id);
    return { ok: true };
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
