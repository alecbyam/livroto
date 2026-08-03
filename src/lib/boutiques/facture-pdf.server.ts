// Rendu PDF de facture, côté serveur uniquement (pdfkit ne tourne pas dans un
// navigateur). Appelé en best-effort juste après l'encaissement d'une vente
// (cf. pos.functions.ts) : un échec de rendu PDF ne doit JAMAIS faire échouer
// la vente elle-même — la caisse doit rester utilisable même si le stockage
// est temporairement indisponible.
import PDFDocument from "pdfkit";
import sharp from "sharp";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MODE_PAIEMENT_LABEL: Record<string, string> = {
  cash: "Cash",
  mobile_money: "FlexPay (Mobile Money)",
  carte: "Carte bancaire",
  paiement_livraison: "Paiement à la livraison",
  credit: "Crédit",
};

function renderPdf(params: {
  boutique: { nom: string; slogan: string | null; adresse: string | null; telephone: string | null; email: string | null; rccm: string | null; id_national: string | null; devise: string };
  logo: Buffer | null;
  facture: { numero: string | null; created_at: string };
  vente: { numero: string | null; canal: string; mode_paiement: string; sous_total_usd: number; remise_usd: number; total_usd: number; created_at: string };
  client: { nom: string; telephone: string } | null;
  credit: { montant_paye_usd: number; date_echeance: string; statut: string } | null;
  lignes: Array<{ nom: string; quantite: number; prix_unitaire_usd: number; total_ligne_usd: number }>;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { boutique, logo, facture, vente, client, credit, lignes } = params;

    // En-tête : logo à gauche (best-effort — un logo illisible/absent ne doit
    // jamais empêcher la génération de la facture) + identité légale à droite
    // du logo, sur la même ligne, façon papier à en-tête classique.
    // Boîte plus large que haute (70x40) plutôt qu'un carré 50x50 : la
    // plupart des logos avec texte intégré (comme celui-ci, une fois
    // recadré par trim() dans telechargerLogo) sont en format paysage —
    // un carré sous-utiliserait la largeur et laisserait le logo minuscule.
    const LOGO_LARGEUR = 70;
    const LOGO_HAUTEUR = 40;
    const texteX = logo ? 50 + LOGO_LARGEUR + 10 : 50;
    let logoOk = false;
    if (logo) {
      try {
        doc.image(logo, 50, 45, { fit: [LOGO_LARGEUR, LOGO_HAUTEUR] });
        logoOk = true;
      } catch {
        /* format d'image illisible par pdfkit (rare) — on continue sans logo */
      }
    }
    const hautEnTete = doc.y;
    doc.fontSize(18).text(boutique.nom, texteX, 45, { continued: false });
    if (boutique.slogan) {
      doc.fontSize(9).font("Helvetica-Oblique").fillColor("#777").text(boutique.slogan, texteX);
      doc.font("Helvetica").fillColor("#000");
    }
    doc.fontSize(9).fillColor("#555");
    if (boutique.adresse) doc.text(boutique.adresse, texteX);
    const contact = [boutique.telephone, boutique.email].filter(Boolean).join(" · ");
    if (contact) doc.text(contact, texteX);
    const legal = [
      boutique.rccm ? `RCCM: ${boutique.rccm}` : null,
      boutique.id_national ? `ID. Nat.: ${boutique.id_national}` : null,
    ].filter(Boolean).join(" · ");
    if (legal) doc.text(legal, texteX);
    doc.fillColor("#000");
    // Le texte peut être plus court que le logo (50pt) : on repart toujours
    // sous le plus grand des deux blocs pour ne jamais chevaucher la suite.
    doc.y = Math.max(doc.y, logoOk ? 45 + LOGO_HAUTEUR : hautEnTete);
    doc.x = 50;

    doc.moveDown(1.5);
    doc.fontSize(16).text(`FACTURE ${facture.numero ?? ""}`);
    doc.fontSize(9).fillColor("#555")
      .text(`Vente ${vente.numero ?? ""} — ${new Date(facture.created_at).toLocaleString("fr-FR")}`)
      .text(`Canal : ${vente.canal === "ecommerce" ? "e-commerce" : "boutique physique"} — Paiement : ${MODE_PAIEMENT_LABEL[vente.mode_paiement] ?? vente.mode_paiement}`);
    doc.fillColor("#000");

    if (client) {
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Client : ${client.nom} — ${client.telephone}`);
    }

    if (credit) {
      doc.moveDown(0.3);
      const restant = vente.total_usd - credit.montant_paye_usd;
      const libelleStatut =
        credit.statut === "paye" ? "Payé intégralement" : credit.statut === "partiellement_paye" ? "Partiellement payé" : "En attente de paiement";
      doc.fontSize(10).fillColor("#8a5a00")
        .text(`Vente à crédit — Échéance : ${new Date(credit.date_echeance).toLocaleDateString("fr-FR")} — ${libelleStatut}`)
        .text(`Déjà payé : ${credit.montant_paye_usd.toFixed(2)} ${boutique.devise} — Reste à payer : ${restant.toFixed(2)} ${boutique.devise}`);
      doc.fillColor("#000");
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

    doc.moveDown(2);
    doc.fontSize(9).fillColor("#888").text(`Merci pour votre confiance — ${boutique.nom}`, 50, doc.y, { width: 450, align: "center" });
    doc.fillColor("#000");

    doc.end();
  });
}

// Best-effort : un logo introuvable/inaccessible ne doit jamais empêcher la
// génération de la facture (même philosophie que le reste du module — la
// caisse ne doit jamais être bloquée par un souci de stockage/réseau externe).
async function telechargerLogo(logoUrl: string | null): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const original = Buffer.from(await res.arrayBuffer());
    // Facture = document imprimé/officiel : logo en noir et blanc plutôt que
    // la version couleur (déjà utilisée partout ailleurs — vitrine, admin).
    // sharp() préserve le format d'origine (JPEG ici) quand aucune méthode
    // .jpeg()/.png() n'est appelée après .grayscale(). Best-effort comme le
    // reste de cette fonction : un échec de conversion renvoie le logo
    // couleur plutôt que de faire échouer toute la facture.
    //
    // .trim() : beaucoup de logos fournis par les boutiques ont une grosse
    // marge unie autour du dessin (ex. Hugo Collection : carré 1080x1080
    // avec le vrai logo centré sur ~40% de la surface, fond noir uni tout
    // autour) — sans recadrage, ce fond devient un gros pavé noir/gris sur
    // la facture ("le logo occupe une grande place"). trim() détecte et
    // retire automatiquement les bords de couleur uniforme ; sans effet sur
    // un logo déjà bien cadré (rien à retirer).
    try {
      return await sharp(original).trim().toColourspace("b-w").toBuffer();
    } catch {
      try {
        return await sharp(original).toColourspace("b-w").toBuffer();
      } catch {
        return original;
      }
    }
  } catch {
    return null;
  }
}

export async function genererFacturePdf(factureId: string): Promise<string> {
  const { data: facture, error: factureErr } = await supabaseAdmin
    .from("factures")
    .select("id,boutique_id,vente_id,numero,created_at")
    .eq("id", factureId)
    .single();
  if (factureErr) throw new Error(factureErr.message);

  const [{ data: boutique }, { data: vente }, { data: lignes }] = await Promise.all([
    supabaseAdmin.from("boutiques").select("nom,slogan,adresse,telephone,email,rccm,id_national,devise,logo_url").eq("id", facture.boutique_id).single(),
    supabaseAdmin.from("ventes").select("numero,canal,mode_paiement,sous_total_usd,remise_usd,total_usd,created_at,client_id").eq("id", facture.vente_id).single(),
    supabaseAdmin.from("vente_lignes").select("quantite,prix_unitaire_usd,total_ligne_usd,produits(nom)").eq("vente_id", facture.vente_id),
  ]);
  if (!boutique || !vente) throw new Error("Boutique ou vente introuvable pour cette facture");

  let client: { nom: string; telephone: string } | null = null;
  if (vente.client_id) {
    const { data } = await supabaseAdmin.from("clients_boutique").select("nom,telephone").eq("id", vente.client_id).maybeSingle();
    client = data ?? null;
  }

  let credit: { montant_paye_usd: number; date_echeance: string; statut: string } | null = null;
  if (vente.mode_paiement === "credit") {
    const { data } = await supabaseAdmin
      .from("credits")
      .select("montant_paye_usd,date_echeance,statut")
      .eq("vente_id", facture.vente_id)
      .maybeSingle();
    if (data) credit = { montant_paye_usd: Number(data.montant_paye_usd), date_echeance: data.date_echeance, statut: data.statut };
  }

  const logo = await telechargerLogo(boutique.logo_url);

  const pdf = await renderPdf({
    boutique,
    logo,
    facture,
    vente,
    client,
    credit,
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
