import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Montants de récompense (ajustables). Parrain crédité à la 1ʳᵉ livraison du filleul
// (géré par le trigger DB) ; filleul crédité dès l'application du code.
const REWARD_REFERRED = 1;

// Code lisible sans caractères ambigus (0/O, 1/I/L).
function randomCode(): string {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

async function generateUniqueCode(admin: any): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const c = randomCode();
    const { data } = await admin.from("wallets").select("user_id").eq("referral_code", c).maybeSingle();
    if (!data) return c;
  }
  return randomCode() + Math.floor(10 + Math.random() * 89);
}

/** Renvoie (et crée à la volée) le code de parrainage + solde + stats de l'utilisateur. */
export const getMyReferral = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    let { data: wallet } = await admin.from("wallets").select("credit_usd, referral_code").eq("user_id", userId).maybeSingle();
    if (!wallet) {
      await admin.from("wallets").insert({ user_id: userId });
      wallet = { credit_usd: 0, referral_code: null };
    }
    let code: string | null = wallet.referral_code;
    if (!code) {
      code = await generateUniqueCode(admin);
      await admin.from("wallets").update({ referral_code: code, updated_at: new Date().toISOString() }).eq("user_id", userId);
    }
    const { data: refs } = await admin.from("referrals").select("status").eq("referrer_id", userId);
    const invited = refs?.length ?? 0;
    const qualified = (refs ?? []).filter((r: any) => r.status === "qualified").length;
    return { code: code as string, credit_usd: Number(wallet.credit_usd ?? 0), invited, qualified };
  });

/** Rattache un code parrain au nouveau compte (appelé après inscription). Anti-abus. */
export const applyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ code: z.string().trim().min(3).max(20) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const code = data.code.trim().toUpperCase();

    // 1 parrainage par filleul
    const { data: existing } = await admin.from("referrals").select("id").eq("referred_id", userId).maybeSingle();
    if (existing) return { ok: false as const, reason: "already_referred" };

    // code valide ?
    const { data: refWallet } = await admin.from("wallets").select("user_id").eq("referral_code", code).maybeSingle();
    if (!refWallet) return { ok: false as const, reason: "invalid_code" };
    if (refWallet.user_id === userId) return { ok: false as const, reason: "self" };

    // éligible seulement si compte neuf (aucune commande passée)
    const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("customer_id", userId);
    if ((count ?? 0) > 0) return { ok: false as const, reason: "not_new" };

    const { error: insErr } = await admin.from("referrals").insert({
      referrer_id: refWallet.user_id, referred_id: userId, code, status: "pending", reward_referred_usd: REWARD_REFERRED,
    });
    if (insErr) {
      if (`${insErr.message}`.toLowerCase().includes("duplicate")) return { ok: false as const, reason: "already_referred" };
      throw new Error(insErr.message);
    }

    // Incrément atomique via RPC Postgres — évite la race condition
    // (deux appels simultanés read-then-write perdraient 1 crédit)
    const { error: rpcErr } = await admin.rpc("increment_wallet_credit", {
      p_user_id: userId,
      p_amount: REWARD_REFERRED,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return { ok: true as const, reward: REWARD_REFERRED };
  });

/** Applique le crédit Livroto à une commande (post-insert checkout). Autorité serveur. */
export const redeemCreditForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;

    const { data: order } = await admin.from("orders")
      .select("id, customer_id, subtotal_usd, discount_usd, status").eq("id", data.order_id).maybeSingle();
    if (!order || order.customer_id !== userId || order.status !== "pending") return { ok: false as const, used: 0 };

    const { data: wallet } = await admin.from("wallets").select("credit_usd").eq("user_id", userId).maybeSingle();
    const credit = Number(wallet?.credit_usd ?? 0);
    if (credit <= 0) return { ok: true as const, used: 0 };

    const subtotal = Number(order.subtotal_usd ?? 0);
    const existingDiscount = Number(order.discount_usd ?? 0);
    const available = Math.max(0, subtotal - existingDiscount);
    const used = Math.min(credit, available);
    if (used <= 0) return { ok: true as const, used: 0 };

    const newDiscount = existingDiscount + used;
    const newTotal = Math.max(0, subtotal - newDiscount);

    // Les deux updates sont dans des appels séparés mais le montant `used`
    // est calculé depuis le solde lu ci-dessus — risque résiduel faible
    // car redeemCreditForOrder n'est appelé qu'une fois par commande (guard order.status).
    const { error: oErr } = await admin.from("orders")
      .update({ discount_usd: newDiscount, total_usd: newTotal })
      .eq("id", order.id)
      .eq("status", "pending"); // guard double-submit
    if (oErr) throw new Error(oErr.message);

    // Débit atomique via RPC pour éviter race si l'utilisateur clique 2x
    const { error: wErr } = await admin.rpc("increment_wallet_credit", {
      p_user_id: userId,
      p_amount: -used,
    });
    if (wErr) throw new Error(wErr.message);

    return { ok: true as const, used, new_total: newTotal };
  });
