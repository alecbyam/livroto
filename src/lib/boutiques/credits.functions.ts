// Ventes à crédit : lecture (liste + rapport) et enregistrement des
// paiements. La création du crédit se fait dans pos.functions.ts au moment
// de l'encaissement (mode_paiement = "credit") — ici on ne fait que suivre
// et solder une dette déjà ouverte.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertBoutiqueStaff } from "@/lib/boutiques/auth.server";

export const boutiqueListerCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        // "en_retard" n'est pas une valeur de credits.statut (calculée, pas
        // stockée) — filtrée côté serveur après la requête plutôt qu'en SQL.
        filtre: z.enum(["tous", "en_attente", "partiellement_paye", "paye", "en_retard"]).default("tous"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    let q = context.supabase
      .from("credits")
      .select(
        "id,montant_total_usd,montant_paye_usd,date_echeance,statut,created_at,vente_id,ventes(numero),clients_boutique(id,nom,telephone)",
      )
      .eq("boutique_id", data.boutique_id);
    if (data.filtre !== "tous" && data.filtre !== "en_retard") q = q.eq("statut", data.filtre);
    const { data: rows, error } = await q.order("date_echeance", { ascending: true });
    if (error) throw new Error(error.message);

    const aujourdHui = new Date().toISOString().slice(0, 10);
    let credits = (rows ?? []).map((c) => ({
      ...c,
      montant_restant_usd: Math.round((c.montant_total_usd - c.montant_paye_usd) * 100) / 100,
      en_retard: c.statut !== "paye" && c.date_echeance < aujourdHui,
    }));
    if (data.filtre === "en_retard") credits = credits.filter((c) => c.en_retard);
    return { credits };
  });

export const boutiqueEnregistrerPaiementCredit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        boutique_id: z.string().uuid(),
        credit_id: z.string().uuid(),
        montant_usd: z.number().positive().max(100000),
        mode_paiement: z.enum(["cash", "mobile_money", "carte"]).default("cash"),
        note: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id, ["admin", "vendeur", "caissier"]);

    const { data: credit, error: creditErr } = await context.supabase
      .from("credits")
      .select("id,montant_total_usd,montant_paye_usd,statut")
      .eq("id", data.credit_id)
      .eq("boutique_id", data.boutique_id)
      .single();
    if (creditErr) throw new Error(creditErr.message);
    if (credit.statut === "paye") throw new Error("Ce crédit est déjà entièrement payé.");

    const restant = Math.round((credit.montant_total_usd - credit.montant_paye_usd) * 100) / 100;
    if (data.montant_usd > restant) {
      throw new Error(`Le montant dépasse le solde restant (${restant} $).`);
    }

    const { error } = await context.supabase.from("credit_paiements").insert({
      credit_id: data.credit_id,
      boutique_id: data.boutique_id,
      montant_usd: data.montant_usd,
      mode_paiement: data.mode_paiement,
      encaisse_par: context.userId,
      note: data.note ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const boutiqueObtenirRapportCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ boutique_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBoutiqueStaff(context, data.boutique_id);
    const { data: rows, error } = await context.supabase
      .from("credits")
      .select("montant_total_usd,montant_paye_usd,date_echeance,statut")
      .eq("boutique_id", data.boutique_id);
    if (error) throw new Error(error.message);

    const aujourdHui = new Date().toISOString().slice(0, 10);
    const c = rows ?? [];
    const total_du_usd = c.reduce((s, r) => s + Number(r.montant_total_usd), 0);
    const total_paye_usd = c.reduce((s, r) => s + Number(r.montant_paye_usd), 0);
    const total_restant_usd = Math.round((total_du_usd - total_paye_usd) * 100) / 100;
    const enRetard = c.filter((r) => r.statut !== "paye" && r.date_echeance < aujourdHui);
    const total_en_retard_usd = Math.round(
      enRetard.reduce((s, r) => s + (Number(r.montant_total_usd) - Number(r.montant_paye_usd)), 0) * 100,
    ) / 100;

    return {
      nb_credits: c.length,
      nb_en_attente: c.filter((r) => r.statut === "en_attente").length,
      nb_partiellement_payes: c.filter((r) => r.statut === "partiellement_paye").length,
      nb_payes: c.filter((r) => r.statut === "paye").length,
      nb_en_retard: enRetard.length,
      total_du_usd: Math.round(total_du_usd * 100) / 100,
      total_paye_usd: Math.round(total_paye_usd * 100) / 100,
      total_restant_usd,
      total_en_retard_usd,
    };
  });
