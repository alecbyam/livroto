// Rendu PDF de facture, côté serveur uniquement (pdfkit ne tourne pas dans un
// navigateur). Appelé en best-effort juste après l'encaissement d'une vente
// (cf. pos.functions.ts) : un échec de rendu PDF ne doit JAMAIS faire échouer
// la vente elle-même — la caisse doit rester utilisable même si le stockage
// est temporairement indisponible.
import PDFDocument from "pdfkit";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function renderPdf(params: {
  boutique: { nom: string; adresse: string | null; telephone: string | null; email: string | null; rccm: string | null; id_national: string | null; devise: string };
  facture: { numero: string | null; created_at: string };
  vente: { numero: string | null; canal: string; mode_paiement: string; sous_total_usd: number; remise_usd: number; total_usd: number; created_at: string };
  client: { nom: string; telephone: string } | null;
  lignes: Array<{ nom: string; quantite: number; prix_unitaire_usd: number; total_ligne_usd: number }>;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { boutique, facture, vente, client, lignes } = params;

    doc.fontSize(18).text(boutique.nom, { continued: false });
    doc.fontSize(9).fillColor("#555");
    if (boutique.adresse) doc.text(boutique.adresse);
    const contact = [boutique.telephone, boutique.email].filter(Boolean).join(" · ");
    if (contact) doc.text(contact);
    const legal = [
      boutique.rccm ? `RCCM: ${boutique.rccm}` : null,
      boutique.id_national ? `ID. Nat.: ${boutique.id_national}` : null,
    ].filter(Boolean).join(" · ");
    if (legal) doc.text(legal);
    doc.fillColor("#000");

    doc.moveDown(1.5);
    doc.fontSize(16).text(`FACTURE ${facture.numero ?? ""}`);
    doc.fontSize(9).fillColor("#555")
      .text(`Vente ${vente.numero ?? ""} — ${new Date(facture.created_at).toLocaleString("fr-FR")}`)
      .text(`Canal : ${vente.canal === "ecommerce" ? "e-commerce" : "boutique physique"} — Paiement : ${vente.mode_paiement}`);
    doc.fillColor("#000");

    if (client) {
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Client : ${client.nom} — ${client.telephone}`);
    }

    doc.moveDown(1);
    const top = doc.y;
    doc.fontSize(9).fillColor("#555");
    doc.text("Article", 50, top, { width: 220 });
    doc.text("Qté", 270, top, { width: 50, align: "right" });
    doc.text("Prix unit.", 320, top, { width: 90, align: "right" });
    doc.text("Total", 410, top, { width: 90, align: "right" });
    doc.fillColor("#000");
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(500, doc.y).strokeColor("#ddd").stroke();
    doc.moveDown(0.3);

    for (const l of lignes) {
      const y = doc.y;
      doc.fontSize(10);
      doc.text(l.nom, 50, y, { width: 220 });
      doc.text(String(l.quantite), 270, y, { width: 50, align: "right" });
      doc.text(l.prix_unitaire_usd.toFixed(2), 320, y, { width: 90, align: "right" });
      doc.text(l.total_ligne_usd.toFixed(2), 410, y, { width: 90, align: "right" });
      doc.moveDown(0.6);
    }

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(500, doc.y).strokeColor("#ddd").stroke();
    doc.moveDown(0.5);

    const ligneMontant = (label: string, montant: number, gras = false) => {
      const y = doc.y;
      doc.fontSize(gras ? 12 : 10).font(gras ? "Helvetica-Bold" : "Helvetica");
      doc.text(label, 320, y, { width: 90, align: "right" });
      doc.text(`${montant.toFixed(2)} ${boutique.devise}`, 410, y, { width: 90, align: "right" });
      doc.moveDown(0.5);
      doc.font("Helvetica");
    };
    ligneMontant("Sous-total", vente.sous_total_usd);
    if (vente.remise_usd > 0) ligneMontant("Remise", -vente.remise_usd);
    ligneMontant("Total", vente.total_usd, true);

    doc.end();
  });
}

export async function genererFacturePdf(factureId: string): Promise<string> {
  const { data: facture, error: factureErr } = await supabaseAdmin
    .from("factures")
    .select("id,boutique_id,vente_id,numero,created_at")
    .eq("id", factureId)
    .single();
  if (factureErr) throw new Error(factureErr.message);

  const [{ data: boutique }, { data: vente }, { data: lignes }] = await Promise.all([
    supabaseAdmin.from("boutiques").select("nom,adresse,telephone,email,rccm,id_national,devise").eq("id", facture.boutique_id).single(),
    supabaseAdmin.from("ventes").select("numero,canal,mode_paiement,sous_total_usd,remise_usd,total_usd,created_at,client_id").eq("id", facture.vente_id).single(),
    supabaseAdmin.from("vente_lignes").select("quantite,prix_unitaire_usd,total_ligne_usd,produits(nom)").eq("vente_id", facture.vente_id),
  ]);
  if (!boutique || !vente) throw new Error("Boutique ou vente introuvable pour cette facture");

  let client: { nom: string; telephone: string } | null = null;
  if (vente.client_id) {
    const { data } = await supabaseAdmin.from("clients_boutique").select("nom,telephone").eq("id", vente.client_id).maybeSingle();
    client = data ?? null;
  }

  const pdf = await renderPdf({
    boutique,
    facture,
    vente,
    client,
    lignes: (lignes ?? []).map((l: any) => ({
      nom: l.produits?.nom ?? "Produit",
      quantite: l.quantite,
      prix_unitaire_usd: Number(l.prix_unitaire_usd),
      total_ligne_usd: Number(l.total_ligne_usd),
    })),
  });

  const path = `${facture.boutique_id}/${facture.id}.pdf`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("boutiques-factures")
    .upload(path, pdf, { contentType: "application/pdf", upsert: true, cacheControl: "3600" });
  if (upErr) throw new Error(upErr.message);

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from("boutiques-factures")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5 ans, même convention que uploadProductImage
  if (signErr || !signed) throw signErr ?? new Error("URL signée impossible");

  const { error: updErr } = await supabaseAdmin.from("factures").update({ pdf_url: signed.signedUrl }).eq("id", factureId);
  if (updErr) throw new Error(updErr.message);

  return signed.signedUrl;
}
