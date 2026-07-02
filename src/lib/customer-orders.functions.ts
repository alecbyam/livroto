import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
