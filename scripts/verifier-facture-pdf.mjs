// Vérification ponctuelle : reproduit la logique de facture-pdf.server.ts en
// script autonome (pas de resolution d'alias "@/..." hors du bundler Vite)
// pour prouver que rendu pdfkit + upload Storage + URL signée fonctionnent
// réellement avec le projet Supabase réel, sur une facture déjà seedée.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import PDFDocument from "pdfkit";

function loadEnv() {
  const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1");
  }
}
loadEnv();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: facture } = await supabase.from("factures").select("id,boutique_id,vente_id,numero,created_at").limit(1).single();
const { data: boutique } = await supabase.from("boutiques").select("nom,adresse,telephone,email,rccm,id_national,devise").eq("id", facture.boutique_id).single();
const { data: vente } = await supabase.from("ventes").select("numero,canal,mode_paiement,sous_total_usd,remise_usd,total_usd").eq("id", facture.vente_id).single();
const { data: lignes } = await supabase.from("vente_lignes").select("quantite,prix_unitaire_usd,total_ligne_usd,produits(nom)").eq("vente_id", facture.vente_id);

console.log("Facture:", facture.numero, "| Vente:", vente.numero, "| Lignes:", lignes.length);

const pdf = await new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.on("error", reject);
  doc.fontSize(18).text(boutique.nom);
  doc.fontSize(9).text(boutique.adresse ?? "");
  doc.moveDown();
  doc.fontSize(16).text(`FACTURE ${facture.numero}`);
  doc.fontSize(10).text(`Vente ${vente.numero} — ${vente.canal} — ${vente.mode_paiement}`);
  doc.moveDown();
  for (const l of lignes) {
    doc.fontSize(10).text(`${l.produits.nom}  x${l.quantite}  ${l.prix_unitaire_usd}$  = ${l.total_ligne_usd}$`);
  }
  doc.moveDown();
  doc.fontSize(12).text(`Total: ${vente.total_usd} ${boutique.devise}`);
  doc.end();
});

console.log(`PDF généré: ${pdf.length} octets`);

const path = `${facture.boutique_id}/${facture.id}.pdf`;
const { error: upErr } = await supabase.storage.from("boutiques-factures").upload(path, pdf, { contentType: "application/pdf", upsert: true });
if (upErr) throw upErr;
console.log("Upload OK:", path);

const { data: signed, error: signErr } = await supabase.storage.from("boutiques-factures").createSignedUrl(path, 60 * 60);
if (signErr) throw signErr;
console.log("URL signée (1h, test):", signed.signedUrl);
