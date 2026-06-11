import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Note : la table `saved_addresses` n'est pas encore dans les types générés
// (types.ts). On caste donc le client en `any` pour ces requêtes, comme pour
// wallets/referrals — à nettoyer à la prochaine régénération des types.

export type SavedAddress = {
  id: string;
  label: string;
  address: string;
  landmark: string | null;
  zone_id: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  created_at: string;
};

const addressInput = z.object({
  label: z.string().trim().min(1, "Donne un nom à l'adresse").max(40),
  address: z.string().trim().min(1, "Adresse requise").max(200),
  landmark: z.string().trim().max(200).nullable().optional(),
  zone_id: z.string().uuid().nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  is_default: z.boolean().optional(),
});

export const getMyAddresses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("saved_addresses")
      .select("id,label,address,landmark,zone_id,lat,lng,is_default,created_at")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { addresses: (data ?? []) as SavedAddress[] };
  });

export const saveAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => addressInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = supabase as any;

    // Une seule adresse par défaut : on retire le drapeau des autres si besoin.
    if (data.is_default) {
      const { error: clrErr } = await db
        .from("saved_addresses")
        .update({ is_default: false })
        .eq("user_id", userId);
      if (clrErr) throw new Error(clrErr.message);
    }

    const { data: row, error } = await db
      .from("saved_addresses")
      .insert({
        user_id: userId,
        label: data.label,
        address: data.address,
        landmark: data.landmark ?? null,
        zone_id: data.zone_id ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        is_default: data.is_default ?? false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id as string };
  });

export const updateAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    addressInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = supabase as any;

    if (data.is_default) {
      const { error: clrErr } = await db
        .from("saved_addresses")
        .update({ is_default: false })
        .eq("user_id", userId);
      if (clrErr) throw new Error(clrErr.message);
    }

    const { error } = await db
      .from("saved_addresses")
      .update({
        label: data.label,
        address: data.address,
        landmark: data.landmark ?? null,
        zone_id: data.zone_id ?? null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        is_default: data.is_default ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("user_id", userId); // défense en profondeur (RLS le garantit déjà)
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const db = supabase as any;
    const { error: clrErr } = await db
      .from("saved_addresses")
      .update({ is_default: false })
      .eq("user_id", userId);
    if (clrErr) throw new Error(clrErr.message);
    const { error } = await db
      .from("saved_addresses")
      .update({ is_default: true })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("saved_addresses")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
