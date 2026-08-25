// ============================================================================
// Cron hebdomadaire : fait tourner l'agent Analytics sur les 7 derniers jours
// et envoie le résultat par email à l'admin — première brique de l'automatisation
// des agents IA (jusqu'ici 100% manuels, voir src/lib/agents.functions.ts).
//
// Déclenché par un appel HTTP externe (GitHub Actions, .github/workflows/
// weekly-report.yml) chaque lundi matin — pas de service cron Railway dédié,
// pour éviter de payer/maintenir un service séparé juste pour un curl hebdo.
//
// Auth : pas d'utilisateur connecté ici (appel serveur-à-serveur), donc pas de
// requireSupabaseAuth — un secret partagé (CRON_SECRET) fait office de garde,
// même niveau d'exigence que le reste : un appel non autorisé ne doit rien
// déclencher (ni appel Claude payant, ni email).
// ============================================================================
import { createFileRoute } from "@tanstack/react-router";

function unauthorized() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderReportHtml(output: {
  periode_analysee: string;
  indicateurs_cles: { nom: string; valeur: string; evolution: string }[];
  observations: string[];
  interpretations: string[];
  recommandations: { action: string; justification: string; effort: string }[];
  anomalies_donnees: string[];
  notes_validation: string;
}, orderCount: number) {
  const list = (items: string[]) =>
    items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : "<p><em>Rien à signaler.</em></p>";

  return `
  <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 640px; margin: 0 auto; color: #1a1a1a;">
    <h1 style="font-size: 20px; margin-bottom: 4px;">📊 Rapport hebdo JuntoxShop</h1>
    <p style="color: #666; margin-top: 0;">${escapeHtml(output.periode_analysee)} — ${orderCount} commande(s) analysée(s)</p>

    <h2 style="font-size: 16px; margin-top: 24px;">Indicateurs clés</h2>
    <table style="width: 100%; border-collapse: collapse;">
      ${output.indicateurs_cles
        .map(
          (k) =>
            `<tr><td style="padding: 6px 0; border-bottom: 1px solid #eee;">${escapeHtml(k.nom)}</td>
             <td style="padding: 6px 0; border-bottom: 1px solid #eee; font-weight: 600;">${escapeHtml(k.valeur)}</td>
             <td style="padding: 6px 0; border-bottom: 1px solid #eee; color: #666;">${escapeHtml(k.evolution)}</td></tr>`,
        )
        .join("")}
    </table>

    <h2 style="font-size: 16px; margin-top: 24px;">Observations</h2>
    ${list(output.observations)}

    <h2 style="font-size: 16px; margin-top: 24px;">Interprétations</h2>
    ${list(output.interpretations)}

    <h2 style="font-size: 16px; margin-top: 24px;">Recommandations</h2>
    ${
      output.recommandations.length
        ? `<ul>${output.recommandations
            .map(
              (r) =>
                `<li><b>${escapeHtml(r.action)}</b> (effort ${escapeHtml(r.effort)}) — ${escapeHtml(r.justification)}</li>`,
            )
            .join("")}</ul>`
        : "<p><em>Rien à signaler.</em></p>"
    }

    ${
      output.anomalies_donnees.length
        ? `<h2 style="font-size: 16px; margin-top: 24px; color: #b45309;">⚠️ Anomalies détectées</h2>${list(output.anomalies_donnees)}`
        : ""
    }

    <p style="margin-top: 24px; padding: 12px; background: #fef3c7; border-radius: 8px; font-size: 13px;">
      <b>À vérifier avant d'agir :</b> ${escapeHtml(output.notes_validation)}
    </p>

    <p style="margin-top: 24px; font-size: 12px; color: #999;">
      Généré automatiquement par l'agent Analytics (Claude) — brouillon informatif, aucune action
      n'a été prise ni envoyée à un client. Consultable aussi dans le dashboard admin (Brouillons IA).
    </p>
  </div>`;
}

export const Route = createFileRoute("/api/cron/weekly-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        const auth = request.headers.get("authorization");
        if (!secret || auth !== `Bearer ${secret}`) return unauthorized();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runAgent } = await import("@/lib/agents/claude.server");
        const { saveDraft } = await import("@/lib/agents.functions");

        const days = 7;
        const since = new Date(Date.now() - days * 86_400_000).toISOString();
        const { data: orders } = await supabaseAdmin
          .from("orders")
          .select("created_at,status,total_usd,delivery_fee,zone,payment_method,quantity")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500);
        const rows = orders ?? [];

        const message =
          `Période analysée : les ${days} derniers jours (à partir du ${since.slice(0, 10)}).\n` +
          `Nombre de commandes : ${rows.length}.\n` +
          `Données de ventes réelles (JSON Supabase, une ligne par commande) :\n` +
          JSON.stringify(rows);
        const output = await runAgent("analytics", message);

        // created_by est NOT NULL (référence un vrai admin) — pas d'utilisateur connecté
        // pour un appel cron, donc on rattache le brouillon au premier compte admin trouvé.
        const { data: adminRole } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1)
          .maybeSingle();

        let draftId: string | null = null;
        if (adminRole?.user_id) {
          draftId = await saveDraft({
            agent: "analytics",
            inputMessage: `Rapport automatique hebdomadaire · ${days} derniers jours · ${rows.length} commande(s)`,
            output,
            userId: adminRole.user_id,
          });
        }

        const emailTo = process.env.REPORT_EMAIL_TO;
        let emailSent = false;
        if (emailTo && process.env.SMTP_HOST) {
          try {
            const nodemailer = await import("nodemailer");
            const transport = nodemailer.createTransport({
              host: process.env.SMTP_HOST,
              port: Number(process.env.SMTP_PORT ?? 465),
              secure: Number(process.env.SMTP_PORT ?? 465) === 465,
              auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            });
            await transport.sendMail({
              from: `"JuntoxShop — Rapport" <${process.env.SMTP_USER}>`,
              to: emailTo,
              subject: `📊 Rapport hebdo JuntoxShop — ${rows.length} commande(s) cette semaine`,
              html: renderReportHtml(output, rows.length),
            });
            emailSent = true;
          } catch (e) {
            console.error("[weekly-report] échec envoi email (brouillon quand même enregistré) :", e);
          }
        }

        return new Response(
          JSON.stringify({ ok: true, orderCount: rows.length, draftId, emailSent }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
