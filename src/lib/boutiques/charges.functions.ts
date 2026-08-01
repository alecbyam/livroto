// Charges d'exploitation (loyer/personnel/autre) — alimente le calcul de
// rentabilité réelle en rapports (marge nette = marge brute - charges de la
// période, cf. rapports.functions.ts). CRUD réservé aux admins de bout en
// bout (lecture incluse) : données financières sensibles, même convention
// que parametres.functions.ts, contrairement à categories.functions.ts où
// admin ET vendeur peuvent lire/écrire.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";

const CHAMPS = "id,type,libelle,montant_usd,recurrence,date_charge,date_fin,actif,created_at";

export const boutiqueListerCharges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ boutique_id: z.string().uuid(), inclure_inactives: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    let q = context.supabase.from("boutique_charges").select(CHAMPS).eq("boutique_id", data.boutique_id);
    if (!data.inclure_inactives) q = q.eq("actif", true);
    const { data: rows, error } = await q.order("date_charge", { ascending: false });
    if (error) throw new Error(error.message);
    return { charges: rows ?? [] };
  });

export const boutiqueCreerCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        type: z.enum(["loyer", "personnel", "autre"]),
        libelle: z.string().min(1).max(120),
        montant_usd: z.number().positive().max(1000000),
        recurrence: z.enum(["mensuelle", "ponctuelle"]),
        // YYYY-MM-DD — mensuelle : date de démarrage de la récurrence (jour de
        // référence pour le prorata jour/jour) ; ponctuelle : date exacte de
        // la dépense.
        date_charge: z.string().max(10),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const { boutique_id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("boutique_charges")
      .insert({ boutique_id, ...rest })
      .select(CHAMPS)
      .single();
    if (error) throw new Error(error.message);
    return { charge: row };
  });

export const boutiqueModifierCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        charge_id: z.string().uuid(),
        type: z.enum(["loyer", "personnel", "autre"]).optional(),
        libelle: z.string().min(1).max(120).optional(),
        montant_usd: z.number().positive().max(1000000).optional(),
        recurrence: z.enum(["mensuelle", "ponctuelle"]).optional(),
        date_charge: z.string().max(10).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const { boutique_id, charge_id, ...patch } = data;
    const { error } = await context.supabase
      .from("boutique_charges")
      .update(patch)
      .eq("id", charge_id)
      .eq("boutique_id", boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Désactivation, jamais suppression : préserve l'historique de rentabilité
// des périodes passées. Contrairement à boutiqueSupprimerCategorie, une
// charge MENSUELLE reçoit aussi une date_fin (= aujourd'hui, si pas déjà
// définie) : sans ça, le calcul de rentabilité (prorata jour/jour) ne
// saurait pas où arrêter de compter cette charge pour les périodes passées
// qui la chevauchent encore.
export const boutiqueSupprimerCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ boutique_id: z.string().uuid(), charge_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin"]);
    const { data: charge, error: lireErr } = await context.supabase
      .from("boutique_charges")
      .select("recurrence, date_fin")
      .eq("id", data.charge_id)
      .eq("boutique_id", data.boutique_id)
      .single();
    if (lireErr) throw new Error(lireErr.message);
    const patch: { actif: boolean; date_fin?: string } = { actif: false };
    if (charge.recurrence === "mensuelle" && !charge.date_fin) {
      patch.date_fin = new Date().toISOString().slice(0, 10);
    }
    const { error } = await context.supabase
      .from("boutique_charges")
      .update(patch)
      .eq("id", data.charge_id)
      .eq("boutique_id", data.boutique_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
